// Live-AI endpoint for the Book Studio demo (Vercel Function).
//
// The demo keeps its data in the visitor's browser, so the browser sends the
// chapter context with each request. This function builds the prompts itself
// (it never accepts a raw prompt), checks an access code, caps input sizes and
// calls Claude. The Anthropic key lives only in Vercel's environment variables.
//
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   ANTHROPIC_API_KEY   required
//   DEMO_ACCESS_CODE    required; visitors type it to switch on live AI
//   ALLOWED_ORIGINS     optional, comma-separated; default allows any origin
//   DRAFT_MODEL / CHECK_MODEL / SUGGEST_MODEL / BLUEPRINT_MODEL   optional overrides

import Anthropic from "@anthropic-ai/sdk";
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
  type SourceDoc,
  SUGGEST_SCHEMA,
  suggestPrompt,
  systemPrompt,
} from "../../supabase/functions/_shared/prompts";

const LIMITS = { title: 300, goal: 1000, text: 60_000, notes: 30_000, excerpt: 12_000, sources: 8, glossary: 200, chapters: 40 };
const MODELS = {
  draft: process.env.DRAFT_MODEL || "claude-opus-5-5",
  check: process.env.CHECK_MODEL || "claude-haiku-5-5",
  suggest: process.env.SUGGEST_MODEL || "claude-opus-5-5",
  blueprint: process.env.BLUEPRINT_MODEL || "claude-haiku-5-5",
};

function cors(origin: string | null): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allow = !allowed.length ? "*" : origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Demo-Code",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

function sameCode(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const lang = (v: unknown): Lang => (v === "ka" ? "ka" : "en");

function context(b: Record<string, unknown>): { ctx: BookContext; sources: SourceDoc[]; glossary: GlossaryTerm[] } {
  const chapters = Array.isArray(b.chapterTitles) ? b.chapterTitles.slice(0, LIMITS.chapters).map((t) => str(t, LIMITS.title)) : [];
  const sources = (Array.isArray(b.sources) ? b.sources : []).slice(0, LIMITS.sources).map((s: Record<string, unknown>) => ({
    title: str(s?.title, LIMITS.title), reference: str(s?.reference, LIMITS.title), kind: str(s?.kind, 30), excerpt: str(s?.excerpt, LIMITS.excerpt),
  }));
  const glossary = (Array.isArray(b.glossary) ? b.glossary : []).slice(0, LIMITS.glossary).map((g: Record<string, unknown>) => ({
    term_en: str(g?.term_en, 120), term_ka: str(g?.term_ka, 120), note: str(g?.note, 300),
  }));
  return {
    ctx: { orgName: str(b.orgName, 120) || "the organisation", bookTitle: str(b.bookTitle, LIMITS.title), chapterTitles: chapters },
    sources,
    glossary,
  };
}

const textOf = (content: Anthropic.ContentBlock[]) =>
  content.filter((c) => c.type === "text").map((c) => (c as Anthropic.TextBlock).text).join("");

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request.headers.get("Origin")) });
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("Origin");
  const expected = process.env.DEMO_ACCESS_CODE || "";
  if (!process.env.ANTHROPIC_API_KEY || !expected) {
    return json({ error: "Live AI is not set up on the server yet." }, 503, origin);
  }
  if (!sameCode(request.headers.get("X-Demo-Code") || "", expected)) {
    return json({ error: "That access code is not right.", code: "bad_code" }, 401, origin);
  }

  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400, origin);
  }
  if (b.op === "ping") return json({ ok: true }, 200, origin);

  const client = new Anthropic();
  const { ctx, sources, glossary } = context(b);
  const system = systemPrompt(ctx);
  const title = str(b.chapterTitle, LIMITS.title);
  const goal = str(b.goal, LIMITS.goal);
  const text = str(b.text, LIMITS.text);
  const l = lang(b.lang);

  try {
    if (b.op === "draft" || b.op === "adapt") {
      const prompt = b.op === "draft"
        ? draftPrompt({ ctx, lang: l, chapterTitle: title, goal, existingText: text, sources, glossary })
        : adaptPrompt({ ctx, from: lang(b.from), to: l, chapterTitle: title, sourceText: str(b.sourceText, LIMITS.text), glossary });
      if (b.op === "adapt" && !str(b.sourceText, 10).trim()) return json({ error: "There is no text to adapt yet." }, 400, origin);

      const stream = client.beta.messages.stream({
        model: MODELS.draft,
        max_tokens: 32000,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: [{ role: "user", content: prompt }],
      });
      const enc = new TextEncoder();
      const body = new ReadableStream({
        async start(controller) {
          const send = (e: Record<string, unknown>) => {
            try { controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { /* client gone */ }
          };
          try {
            for await (const ev of stream) {
              if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") send({ type: "delta", text: ev.delta.text });
            }
            const final = await stream.finalMessage();
            if (final.stop_reason === "refusal") send({ type: "error", message: "The AI declined to write this chapter. Rephrase the goal or write it yourself." });
            else send({ type: "done", model: final.model, text: textOf(final.content as Anthropic.ContentBlock[]).trim(), truncated: final.stop_reason === "max_tokens" });
          } catch (err) {
            console.error(err);
            send({ type: "error", message: err instanceof Anthropic.RateLimitError ? "The AI service is busy. Try again in a minute." : "The AI service returned an error. Try again." });
          } finally {
            try { controller.close(); } catch { /* closed */ }
          }
        },
      });
      return new Response(body, { headers: { ...cors(origin), "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    if (b.op === "check" || b.op === "suggest") {
      if (b.op === "check" && !text.trim()) return json({ error: "There is no text to check in this language." }, 400, origin);
      const isCheck = b.op === "check";
      const prompt = isCheck
        ? checkPrompt({ ctx, lang: l, chapterTitle: title, text, otherLangText: str(b.otherText, LIMITS.text), sources, glossary })
        : suggestPrompt({ ctx, lang: l, chapterTitle: title, goal, text, sources, glossary });
      const res = await client.messages.create({
        model: isCheck ? MODELS.check : MODELS.suggest,
        max_tokens: 12000,
        system,
        output_config: isCheck
          ? { format: { type: "json_schema", schema: CHECK_SCHEMA as unknown as Record<string, unknown> } }
          : { effort: "medium", format: { type: "json_schema", schema: SUGGEST_SCHEMA as unknown as Record<string, unknown> } },
        messages: [{ role: "user", content: prompt }],
      });
      if (res.stop_reason === "refusal") return json({ error: "The AI declined to review this text." }, 422, origin);
      const out = textOf(res.content);
      return json(isCheck ? { flags: parseFlags(out) } : { suggestions: parseSuggestions(out) }, 200, origin);
    }

    if (b.op === "blueprint") {
      const notes = str(b.notes, LIMITS.notes);
      if (notes.trim().length < 20) return json({ error: "Add a few lines of notes first." }, 400, origin);
      const res = await client.messages.create({
        model: MODELS.blueprint,
        max_tokens: 8000,
        system,
        output_config: { format: { type: "json_schema", schema: BLUEPRINT_SCHEMA as unknown as Record<string, unknown> } },
        messages: [{ role: "user", content: blueprintPrompt({ ctx, notes, goalLang: l }) }],
      });
      if (res.stop_reason === "refusal") return json({ error: "The AI declined to structure these notes." }, 422, origin);
      const chapters = parseBlueprint(textOf(res.content));
      if (!chapters.length) return json({ error: "The AI didn't return a usable structure. Try again." }, 502, origin);
      return json({ chapters }, 200, origin);
    }
  } catch (err) {
    console.error(err);
    const status = err instanceof Anthropic.APIError && err.status === 429 ? 429 : 502;
    return json({ error: status === 429 ? "The AI service is busy. Try again in a minute." : "The AI service returned an error. Try again." }, status, origin);
  }

  return json({ error: "Unknown operation." }, 400, origin);
}
