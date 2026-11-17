// AI gateway. The only place AI text enters Book Studio.
//
// POST /functions/v1/ai
//   { op: "draft",     chapter_id, lang }                 -> SSE stream, saves an AI version
//   { op: "adapt",     chapter_id, from, to }             -> SSE stream, saves an AI version
//   { op: "check",     chapter_id, lang }                 -> JSON { flags }
//   { op: "suggest",   chapter_id, lang }                 -> JSON { suggestions } (advice only, no text written)
//   { op: "blueprint", book_id, notes, goal_lang }        -> JSON { chapters } (inserted into the book)
//
// Every call: verifies the user and their role, enforces the organisation's monthly
// AI allowance, meters token cost, and (for prose) writes the version as source='ai'
// with the service role, so the provenance record can't be faked from the browser.

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { adminClient, env, requireRole, requireUser, userClient } from "../_shared/clients.ts";
import { corsHeaders, handleError, HttpError, json, preflight } from "../_shared/http.ts";
import { costUsd, DEFAULT_MODELS, estimateMaxCost, type Op } from "../_shared/pricing.ts";
import {
  adaptPrompt,
  BLUEPRINT_SCHEMA,
  blueprintPrompt,
  type BookContext,
  CHECK_SCHEMA,
  checkPrompt,
  draftPrompt,
  type GlossaryTerm,
  type Lang,
  parseBlueprint,
  parseFlags,
  parseSuggestions,
  SUGGEST_SCHEMA,
  suggestPrompt,
  type SourceDoc,
  systemPrompt,
} from "../_shared/prompts.ts";

const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });

function modelFor(op: Op): string {
  return Deno.env.get(`${op.toUpperCase()}_MODEL`) ?? DEFAULT_MODELS[op];
}

interface ChapterRow {
  id: string;
  org_id: string;
  book_id: string;
  title_en: string;
  title_ka: string;
  goal: string;
  status: string;
}

interface Loaded {
  chapter: ChapterRow;
  ctx: BookContext;
  sources: SourceDoc[];
  glossary: GlossaryTerm[];
  texts: Record<Lang, string>;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    const db = userClient(req);
    const user = await requireUser(db);
    const body = await req.json().catch(() => ({}));
    const op = body.op as Op;
    if (!["draft", "adapt", "check", "suggest", "blueprint"].includes(op)) throw new HttpError(400, "Unknown operation.");

    if (op === "blueprint") return await blueprint(db, user.id, body);

    const loaded = await loadChapter(db, String(body.chapter_id ?? ""));
    if (op === "check") return await check(db, user.id, loaded, body);
    if (op === "suggest") return await suggest(db, user.id, loaded, body);
    return await streamProse(db, user.id, loaded, op, body);
  } catch (err) {
    return handleError(err);
  }
});

// ---------------------------------------------------------------------------

async function loadChapter(db: SupabaseClient, chapterId: string): Promise<Loaded> {
  // Read with the user's client: row-level security proves membership.
  const { data: chapter, error } = await db
    .from("chapters")
    .select("id, org_id, book_id, title_en, title_ka, goal, status")
    .eq("id", chapterId)
    .maybeSingle();
  if (error) throw error;
  if (!chapter) throw new HttpError(404, "Chapter not found.");

  const [book, org, siblings, links, glossary, texts] = await Promise.all([
    db.from("books").select("title").eq("id", chapter.book_id).single(),
    db.from("organizations").select("name, subscription_status").eq("id", chapter.org_id).single(),
    db.from("chapters").select("title_en, title_ka, position").eq("book_id", chapter.book_id).order("position"),
    db.from("chapter_sources").select("sources(title, reference, kind, excerpt)").eq("chapter_id", chapterId),
    db.from("glossary_terms").select("term_en, term_ka, note").eq("org_id", chapter.org_id),
    db.from("chapter_provenance").select("lang, body").eq("chapter_id", chapterId),
  ]);
  for (const r of [book, org, siblings, links, glossary, texts]) if (r.error) throw r.error;
  assertSubscriptionActive(org.data!.subscription_status);

  const byLang: Record<Lang, string> = { en: "", ka: "" };
  for (const row of texts.data ?? []) byLang[row.lang as Lang] = row.body ?? "";

  return {
    chapter: chapter as ChapterRow,
    ctx: {
      orgName: org.data!.name,
      bookTitle: book.data!.title,
      chapterTitles: (siblings.data ?? []).map((c) => c.title_en || c.title_ka),
    },
    sources: (links.data ?? [])
      .map((l) => (l as unknown as { sources: SourceDoc | null }).sources)
      .filter((s): s is SourceDoc => !!s),
    glossary: (glossary.data ?? []) as GlossaryTerm[],
    texts: byLang,
  };
}

function assertSubscriptionActive(status: string) {
  if (["canceled", "unpaid", "incomplete"].includes(status)) {
    throw new HttpError(402, "Your subscription is not active. The owner can renew it under Settings → Billing.", "subscription_inactive");
  }
}

async function assertBudget(orgId: string, op: Op, model: string, promptChars: number) {
  const admin = adminClient();
  const [spend, budget] = await Promise.all([
    admin.rpc("org_ai_spend_this_month", { p_org: orgId }),
    admin.rpc("org_ai_budget", { p_org: orgId }),
  ]);
  if (spend.error) throw spend.error;
  if (budget.error) throw budget.error;
  const used = Number(spend.data ?? 0);
  const limit = Number(budget.data ?? 0);
  // Allow the call if at least the likely cost of one call remains, so a nearly
  // exhausted allowance can't be overrun by a large draft.
  const headroom = Math.min(estimateMaxCost(op, model, promptChars), limit * 0.25);
  if (used + headroom > limit) {
    throw new HttpError(
      402,
      `Your organisation has used its AI allowance for this month ($${used.toFixed(2)} of $${limit.toFixed(2)}). It resets on the 1st; the owner can upgrade the plan for a larger allowance.`,
      "ai_budget_exhausted",
    );
  }
}

async function recordUsage(row: {
  org_id: string;
  user_id: string;
  book_id: string | null;
  chapter_id: string | null;
  op: Op;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
}) {
  const { error } = await adminClient().from("ai_usage").insert({
    org_id: row.org_id,
    user_id: row.user_id,
    book_id: row.book_id,
    chapter_id: row.chapter_id,
    op: row.op,
    model: row.model,
    input_tokens: row.usage.input_tokens + (row.usage.cache_creation_input_tokens ?? 0) + (row.usage.cache_read_input_tokens ?? 0),
    output_tokens: row.usage.output_tokens,
    cost_usd: costUsd(row.model, row.usage),
  });
  if (error) console.error("usage insert failed", error);
}

function assertEditable(status: string) {
  if (status !== "draft" && status !== "changes_requested") {
    throw new HttpError(409, "This chapter is in review or approved. Open a new revision before changing its text.", "locked");
  }
}

function parseLang(v: unknown, name: string): Lang {
  if (v === "en" || v === "ka") return v;
  throw new HttpError(400, `Invalid ${name} language.`);
}

// ---------------------------------------------------------------------------
// draft / adapt: streamed prose

async function streamProse(db: SupabaseClient, userId: string, l: Loaded, op: Op, body: Record<string, unknown>) {
  await requireRole(db, l.chapter.org_id, "author");
  assertEditable(l.chapter.status);

  let lang: Lang;
  let prompt: string;
  if (op === "draft") {
    lang = parseLang(body.lang, "target");
    prompt = draftPrompt({
      ctx: l.ctx,
      lang,
      chapterTitle: (lang === "ka" ? l.chapter.title_ka : l.chapter.title_en) || l.chapter.title_en || l.chapter.title_ka,
      goal: l.chapter.goal,
      existingText: l.texts[lang],
      sources: l.sources,
      glossary: l.glossary,
    });
  } else {
    const from = parseLang(body.from, "source");
    lang = parseLang(body.to, "target");
    if (from === lang) throw new HttpError(400, "Choose two different languages.");
    if (!l.texts[from].trim()) throw new HttpError(400, "There is no text to adapt in the source language yet.");
    prompt = adaptPrompt({
      ctx: l.ctx,
      from,
      to: lang,
      chapterTitle: l.chapter.title_en || l.chapter.title_ka,
      sourceText: l.texts[from],
      glossary: l.glossary,
    });
  }

  const model = modelFor(op);
  const system = systemPrompt(l.ctx);
  await assertBudget(l.chapter.org_id, op, model, prompt.length + system.length);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false; // browser went away; keep going so the result is still saved
        }
      };
      try {
        const ai = anthropic.beta.messages.stream({
          model,
          max_tokens: 32000,
          output_config: { effort: "high" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system,
          messages: [{ role: "user", content: prompt }],
        });
        for await (const event of ai) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            send({ type: "delta", text: event.delta.text });
          }
        }
        const final = await ai.finalMessage();
        const servedBy = final.model;
        await recordUsage({
          org_id: l.chapter.org_id,
          user_id: userId,
          book_id: l.chapter.book_id,
          chapter_id: l.chapter.id,
          op,
          model: servedBy,
          usage: final.usage,
        });

        if (final.stop_reason === "refusal") {
          send({ type: "error", code: "refusal", message: "The AI declined to write this chapter. Rephrase the goal or write it manually." });
          return;
        }
        const text = final.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { text: string }).text)
          .join("")
          .trim();
        if (!text) {
          send({ type: "error", code: "empty", message: "The AI returned no text. Try again." });
          return;
        }

        const { data: version, error } = await adminClient()
          .from("chapter_versions")
          .insert({
            org_id: l.chapter.org_id,
            chapter_id: l.chapter.id,
            lang,
            body: text,
            source: "ai",
            ai_op: op,
            model: servedBy,
            created_by: userId,
          })
          .select("id")
          .single();
        if (error) {
          send({ type: "error", code: "save_failed", message: "The chapter changed status while the AI was writing, so the text was not saved." });
          return;
        }
        await adminClient().from("audit_events").insert({
          org_id: l.chapter.org_id,
          book_id: l.chapter.book_id,
          chapter_id: l.chapter.id,
          actor_id: userId,
          event: op === "draft" ? "ai_drafted" : "ai_adapted",
          detail: { lang, model: servedBy, version_id: version.id },
        });
        send({
          type: "done",
          version_id: version.id,
          model: servedBy,
          truncated: final.stop_reason === "max_tokens",
        });
      } catch (err) {
        console.error(err);
        const message = err instanceof Anthropic.RateLimitError
          ? "The AI service is busy. Try again in a minute."
          : err instanceof Anthropic.APIError
          ? "The AI service returned an error. Try again."
          : "Something went wrong while drafting. Try again.";
        send({ type: "error", code: "ai_error", message });
      } finally {
        open = false;
        try {
          controller.close();
        } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders(), "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

// ---------------------------------------------------------------------------
// check: consistency review (any member may run it)

async function check(db: SupabaseClient, userId: string, l: Loaded, body: Record<string, unknown>) {
  const lang = parseLang(body.lang, "chapter");
  const text = l.texts[lang];
  if (!text.trim()) throw new HttpError(400, "There is no text to check in this language.");
  const other: Lang = lang === "en" ? "ka" : "en";
  const prompt = checkPrompt({
    ctx: l.ctx,
    lang,
    chapterTitle: l.chapter.title_en || l.chapter.title_ka,
    text,
    otherLangText: l.texts[other],
    sources: l.sources,
    glossary: l.glossary,
  });
  const model = modelFor("check");
  const system = systemPrompt(l.ctx);
  await assertBudget(l.chapter.org_id, "check", model, prompt.length + system.length);

  const res = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system,
    output_config: { format: { type: "json_schema", schema: CHECK_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: "user", content: prompt }],
  });
  await recordUsage({
    org_id: l.chapter.org_id,
    user_id: userId,
    book_id: l.chapter.book_id,
    chapter_id: l.chapter.id,
    op: "check",
    model: res.model,
    usage: res.usage,
  });
  if (res.stop_reason === "refusal") throw new HttpError(422, "The AI declined to review this text.", "refusal");
  const textOut = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  const flags = parseFlags(textOut);

  const admin = adminClient();
  await admin.from("chapter_flags").delete().eq("chapter_id", l.chapter.id).eq("lang", lang).eq("kind", "check");
  if (flags.length) {
    const { error } = await admin.from("chapter_flags").insert(
      flags.map((f) => ({ org_id: l.chapter.org_id, chapter_id: l.chapter.id, lang, type: f.type, note: f.note, kind: "check" })),
    );
    if (error) throw error;
  }
  return json({ flags });
}

// ---------------------------------------------------------------------------
// suggest: editorial advice for an author who writes the text themselves.
// Nothing here writes chapter text, so the chapter stays author-original.

async function suggest(db: SupabaseClient, userId: string, l: Loaded, body: Record<string, unknown>) {
  await requireRole(db, l.chapter.org_id, "author");
  const lang = parseLang(body.lang, "chapter");
  const prompt = suggestPrompt({
    ctx: l.ctx,
    lang,
    chapterTitle: (lang === "ka" ? l.chapter.title_ka : l.chapter.title_en) || l.chapter.title_en || l.chapter.title_ka,
    goal: l.chapter.goal,
    text: l.texts[lang],
    sources: l.sources,
    glossary: l.glossary,
  });
  const model = modelFor("suggest");
  const system = systemPrompt(l.ctx);
  await assertBudget(l.chapter.org_id, "suggest", model, prompt.length + system.length);

  const res = await anthropic.beta.messages.create({
    model,
    max_tokens: 16000,
    system,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SUGGEST_SCHEMA as unknown as Record<string, unknown> } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: prompt }],
  });
  await recordUsage({
    org_id: l.chapter.org_id,
    user_id: userId,
    book_id: l.chapter.book_id,
    chapter_id: l.chapter.id,
    op: "suggest",
    model: res.model,
    usage: res.usage,
  });
  if (res.stop_reason === "refusal") throw new HttpError(422, "The AI declined to review this text.", "refusal");
  const suggestions = parseSuggestions(
    res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(""),
  );

  const admin = adminClient();
  await admin.from("chapter_flags").delete().eq("chapter_id", l.chapter.id).eq("lang", lang).eq("kind", "suggest");
  if (suggestions.length) {
    const { error } = await admin.from("chapter_flags").insert(
      suggestions.map((f) => ({ org_id: l.chapter.org_id, chapter_id: l.chapter.id, lang, type: f.type, note: f.note, kind: "suggest" })),
    );
    if (error) throw error;
  }
  return json({ suggestions });
}

// ---------------------------------------------------------------------------
// blueprint: notes -> chapter structure (inserted into the book)

async function blueprint(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const notes = String(body.notes ?? "").trim();
  if (notes.length < 20) throw new HttpError(400, "Add a few lines of notes first.");
  if (notes.length > 60_000) throw new HttpError(400, "Notes are too long. Split them and run the blueprint in parts.");
  const goalLang = parseLang(body.goal_lang ?? "en", "goal");

  const { data: book, error } = await db.from("books").select("id, org_id, title").eq("id", String(body.book_id ?? "")).maybeSingle();
  if (error) throw error;
  if (!book) throw new HttpError(404, "Book not found.");
  await requireRole(db, book.org_id, "author");

  const [org, existing] = await Promise.all([
    db.from("organizations").select("name, subscription_status").eq("id", book.org_id).single(),
    db.from("chapters").select("title_en, title_ka, position").eq("book_id", book.id).order("position"),
  ]);
  if (org.error) throw org.error;
  if (existing.error) throw existing.error;
  assertSubscriptionActive(org.data.subscription_status);

  const ctx: BookContext = {
    orgName: org.data.name,
    bookTitle: book.title,
    chapterTitles: (existing.data ?? []).map((c) => c.title_en || c.title_ka),
  };
  const prompt = blueprintPrompt({ ctx, notes, goalLang });
  const model = modelFor("blueprint");
  const system = systemPrompt(ctx);
  await assertBudget(book.org_id, "blueprint", model, prompt.length + system.length);

  const res = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system,
    output_config: { format: { type: "json_schema", schema: BLUEPRINT_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: "user", content: prompt }],
  });
  await recordUsage({ org_id: book.org_id, user_id: userId, book_id: book.id, chapter_id: null, op: "blueprint", model: res.model, usage: res.usage });
  if (res.stop_reason === "refusal") throw new HttpError(422, "The AI declined to structure these notes.", "refusal");

  const chapters = parseBlueprint(res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(""));
  if (!chapters.length) throw new HttpError(502, "The AI didn't return a usable structure. Try again.");

  // Insert as the user, so normal permissions apply.
  const start = (existing.data ?? []).reduce((m, c) => Math.max(m, c.position + 1), 0);
  const { data: inserted, error: insErr } = await db
    .from("chapters")
    .insert(chapters.map((c, i) => ({ org_id: book.org_id, book_id: book.id, position: start + i, ...c })))
    .select("id, title_en, title_ka, goal, position");
  if (insErr) throw insErr;
  await adminClient().from("audit_events").insert({
    org_id: book.org_id,
    book_id: book.id,
    actor_id: userId,
    event: "ai_blueprint",
    detail: { chapters: inserted?.length ?? 0, model: res.model },
  });
  return json({ chapters: inserted });
}

