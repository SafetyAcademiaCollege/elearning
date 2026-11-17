// Demo stand-ins for the edge functions (AI gateway, team, billing).
// The AI responses are pre-written; no AI service is called.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { db, DEMO_USER, nextId, persist, type Row, stamp, uid } from "./store";
import { addVersion } from "./client";
import { SAMPLE_BLUEPRINT, SAMPLE_FLAGS, SAMPLE_SUGGESTIONS, sampleChapterText } from "./content";
import type { Lang } from "../types";
import { liveCode, liveFetch } from "./live";

export class DemoError extends Error {}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function usage(org: string, book: string | null, chapter: string | null, op: string, cost: number) {
  db().ai_usage.push({ id: nextId("ai_usage"), org_id: org, user_id: DEMO_USER, book_id: book, chapter_id: chapter, op, model: op === "check" || op === "blueprint" ? "claude-haiku-5-5" : "claude-opus-5-5", input_tokens: 4000, output_tokens: 6000, cost_usd: cost, created_at: stamp() });
}

function chapter(id: string): Row {
  const c = db().chapters.find((x) => x.id === id);
  if (!c) throw new DemoError("Chapter not found.");
  return c;
}

function latest(chapterId: string, lang: Lang): string {
  return db().chapter_versions.filter((v) => v.chapter_id === chapterId && v.lang === lang).sort((a, b) => b.id - a.id)[0]?.body ?? "";
}

function setFlags(c: Row, lang: Lang, kind: "check" | "suggest", items: { type: string; note: string }[]) {
  const t = db();
  t.chapter_flags = t.chapter_flags.filter((f) => !(f.chapter_id === c.id && f.lang === lang && f.kind === kind));
  for (const f of items) t.chapter_flags.push({ id: nextId("chapter_flags"), org_id: c.org_id, chapter_id: c.id, lang, kind, created_at: stamp(), ...f });
}

/** Everything the live AI needs about a chapter, gathered from the demo store. */
function liveContext(c: Row, lang: Lang): Record<string, unknown> {
  const t = db();
  const book = t.books.find((b) => b.id === c.book_id);
  const org = t.organizations.find((o) => o.id === c.org_id);
  const linked = t.chapter_sources.filter((l) => l.chapter_id === c.id).map((l) => l.source_id);
  return {
    orgName: org?.name ?? "",
    bookTitle: book?.title ?? "",
    chapterTitles: t.chapters.filter((x) => x.book_id === c.book_id).sort((a, b) => a.position - b.position).map((x) => x.title_en || x.title_ka),
    chapterTitle: lang === "ka" ? c.title_ka || c.title_en : c.title_en || c.title_ka,
    goal: c.goal,
    lang,
    text: latest(c.id, lang),
    otherText: latest(c.id, lang === "en" ? "ka" : "en"),
    sources: t.sources.filter((s) => linked.includes(s.id)).map(({ title, reference, kind, excerpt }) => ({ title, reference, kind, excerpt })),
    glossary: t.glossary_terms.filter((g) => g.org_id === c.org_id).map(({ term_en, term_ka, note }) => ({ term_en, term_ka, note })),
  };
}

async function liveError(res: Response): Promise<never> {
  const data = await res.json().catch(() => ({}));
  throw new DemoError(data.error ?? `Live AI failed (${res.status}).`);
}

async function liveStream(body: any, c: Row, lang: Lang, onText: (t: string) => void, signal?: AbortSignal): Promise<{ text: string; model: string; truncated: boolean }> {
  const payload = { ...liveContext(c, lang), op: body.op, ...(body.op === "adapt" ? { from: body.from, sourceText: latest(c.id, body.from) } : {}) };
  const res = await liveFetch(payload, signal);
  if (!res.ok || !res.body) await liveError(res);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "", shown = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i).split("\n").find((l) => l.startsWith("data: "));
      buf = buf.slice(i + 2);
      if (!line) continue;
      const ev = JSON.parse(line.slice(6));
      if (ev.type === "delta") { shown += ev.text; onText(shown); }
      else if (ev.type === "done") return { text: ev.text || shown, model: ev.model, truncated: !!ev.truncated };
      else if (ev.type === "error") throw new DemoError(ev.message);
    }
  }
  throw new DemoError("The connection closed before the AI finished. Try again.");
}

export async function demoStream(body: any, onText: (t: string) => void, signal?: AbortSignal) {
  const c = chapter(body.chapter_id);
  if (!["draft", "changes_requested"].includes(c.status)) {
    throw new DemoError("This chapter is in review or approved. Open a new revision before changing its text.");
  }
  const lang: Lang = body.op === "draft" ? body.lang : body.to;
  let text: string;
  let model = "claude-opus-5-5";
  let truncated = false;
  if (liveCode()) {
    const r = await liveStream(body, c, lang, onText, signal);
    ({ text, model, truncated } = r);
  } else {
    const title = lang === "ka" ? c.title_ka || c.title_en : c.title_en || c.title_ka;
    text = sampleChapterText(title, c.goal, lang);
    let shown = "";
    for (const word of text.split(/(\s+)/)) {
      if (signal?.aborted) break;
      shown += word;
      onText(shown);
      await wait(12);
    }
  }
  if (!text.trim()) throw new DemoError("The AI returned no text. Try again.");
  const v = addVersion({ org_id: c.org_id, chapter_id: c.id, lang, body: text, source: "ai", ai_op: body.op, model });
  usage(c.org_id, c.book_id, c.id, body.op, 0.22);
  db().audit_events.push({ id: nextId("audit_events"), org_id: c.org_id, book_id: c.book_id, chapter_id: c.id, actor_id: DEMO_USER, event: body.op === "draft" ? "ai_drafted" : "ai_adapted", detail: { lang }, created_at: stamp() });
  persist();
  return { version_id: v.id, model, truncated };
}

export async function demoFunction(name: string, body: any): Promise<any> {
  const live = name === "ai" && !!liveCode();
  if (!live) await wait(900);
  const t = db();
  if (name === "ai") {
    if (body.op === "check" || body.op === "suggest") {
      const c = chapter(body.chapter_id);
      const lang: Lang = body.lang;
      if (body.op === "check" && !latest(c.id, lang).trim()) throw new DemoError("There is no text to check in this language.");
      let items: { type: string; note: string }[];
      if (live) {
        const res = await liveFetch({ ...liveContext(c, lang), op: body.op });
        if (!res.ok) await liveError(res);
        const data = await res.json();
        items = body.op === "check" ? data.flags : data.suggestions;
      } else {
        items = (body.op === "check" ? SAMPLE_FLAGS : SAMPLE_SUGGESTIONS)[lang];
      }
      setFlags(c, lang, body.op, items);
      usage(c.org_id, c.book_id, c.id, body.op, body.op === "check" ? 0.004 : 0.05);
      persist();
      return body.op === "check" ? { flags: items } : { suggestions: items };
    }
    if (body.op === "blueprint") {
      const b = t.books.find((x) => x.id === body.book_id);
      if (!b) throw new DemoError("Book not found.");
      const start = t.chapters.filter((c) => c.book_id === b.id).reduce((m, c) => Math.max(m, c.position + 1), 0);
      let structure = SAMPLE_BLUEPRINT;
      if (live) {
        const org = t.organizations.find((o) => o.id === b.org_id);
        const res = await liveFetch({
          op: "blueprint", notes: body.notes, lang: body.goal_lang, orgName: org?.name, bookTitle: b.title,
          chapterTitles: t.chapters.filter((c) => c.book_id === b.id).map((c) => c.title_en || c.title_ka),
        });
        if (!res.ok) await liveError(res);
        structure = (await res.json()).chapters;
      }
      const added = structure.map((c, i) => ({ id: uid(), org_id: b.org_id, book_id: b.id, position: start + i, status: "draft", revision: null, approved_at: null, approved_by: null, created_at: stamp(), updated_at: stamp(), ...c }));
      t.chapters.push(...added);
      usage(b.org_id, b.id, null, "blueprint", 0.003);
      persist();
      return { chapters: added };
    }
  }
  if (name === "team") {
    if (body.op === "invite") {
      const email = String(body.email).toLowerCase();
      let p = t.profiles.find((x) => x.email === email);
      if (!p) {
        p = { id: uid(), email, full_name: "", created_at: stamp() };
        t.profiles.push(p);
      }
      if (!t.memberships.some((m) => m.org_id === body.org_id && m.user_id === p!.id)) {
        t.memberships.push({ org_id: body.org_id, user_id: p.id, roles: body.roles, created_at: stamp() });
      }
      persist();
      return { user_id: p.id, invited: true };
    }
    if (body.op === "create_org") {
      const org = { id: uid(), name: body.name, brand_color: "#1F3A52", logo_path: null, plan_id: body.plan ?? "pilot", subscription_status: "pilot", ai_budget_override_usd: null, stripe_customer_id: null, stripe_subscription_id: null, created_at: stamp() };
      t.organizations.push(org);
      t.memberships.push({ org_id: org.id, user_id: DEMO_USER, roles: ["owner", "author", "reviewer", "approver"], created_at: stamp() });
      persist();
      return { org, invited: true };
    }
  }
  if (name === "billing") throw new DemoError("Billing is switched off in the demo. In the live product this opens Stripe Checkout.");
  throw new DemoError("Not available in the demo.");
}
