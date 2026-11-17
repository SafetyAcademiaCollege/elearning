// Demo stand-ins for the edge functions (AI gateway, team, billing).
// The AI responses are pre-written; no AI service is called.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { db, DEMO_USER, nextId, persist, type Row, stamp, uid } from "./store";
import { addVersion } from "./client";
import { SAMPLE_BLUEPRINT, SAMPLE_FLAGS, SAMPLE_SUGGESTIONS, sampleChapterText } from "./content";
import type { Lang } from "../types";

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

export async function demoStream(body: any, onText: (t: string) => void, signal?: AbortSignal) {
  const c = chapter(body.chapter_id);
  if (!["draft", "changes_requested"].includes(c.status)) {
    throw new DemoError("This chapter is in review or approved. Open a new revision before changing its text.");
  }
  const lang: Lang = body.op === "draft" ? body.lang : body.to;
  const title = lang === "ka" ? c.title_ka || c.title_en : c.title_en || c.title_ka;
  const text = sampleChapterText(title, c.goal, lang);
  let shown = "";
  for (const word of text.split(/(\s+)/)) {
    if (signal?.aborted) break;
    shown += word;
    onText(shown);
    await wait(12);
  }
  const v = addVersion({ org_id: c.org_id, chapter_id: c.id, lang, body: text, source: "ai", ai_op: body.op, model: "claude-opus-5-5" });
  usage(c.org_id, c.book_id, c.id, body.op, 0.22);
  db().audit_events.push({ id: nextId("audit_events"), org_id: c.org_id, book_id: c.book_id, chapter_id: c.id, actor_id: DEMO_USER, event: body.op === "draft" ? "ai_drafted" : "ai_adapted", detail: { lang }, created_at: stamp() });
  persist();
  return { version_id: v.id, model: "claude-opus-5-5", truncated: false };
}

export async function demoFunction(name: string, body: any): Promise<any> {
  await wait(900);
  const t = db();
  if (name === "ai") {
    if (body.op === "check" || body.op === "suggest") {
      const c = chapter(body.chapter_id);
      const lang: Lang = body.lang;
      if (body.op === "check" && !latest(c.id, lang).trim()) throw new DemoError("There is no text to check in this language.");
      const items = (body.op === "check" ? SAMPLE_FLAGS : SAMPLE_SUGGESTIONS)[lang];
      setFlags(c, lang, body.op, items);
      usage(c.org_id, c.book_id, c.id, body.op, body.op === "check" ? 0.004 : 0.05);
      persist();
      return body.op === "check" ? { flags: items } : { suggestions: items };
    }
    if (body.op === "blueprint") {
      const b = t.books.find((x) => x.id === body.book_id);
      if (!b) throw new DemoError("Book not found.");
      const start = t.chapters.filter((c) => c.book_id === b.id).reduce((m, c) => Math.max(m, c.position + 1), 0);
      const added = SAMPLE_BLUEPRINT.map((c, i) => ({ id: uid(), org_id: b.org_id, book_id: b.id, position: start + i, status: "draft", revision: null, approved_at: null, approved_by: null, created_at: stamp(), updated_at: stamp(), ...c }));
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
