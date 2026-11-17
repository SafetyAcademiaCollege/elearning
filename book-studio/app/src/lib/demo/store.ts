// In-browser stand-in for the Book Studio database, used only by the demo build.
// It mirrors the real rules (workflow, provenance, autosave merging) closely enough
// to show the product, and keeps everything in this browser's localStorage.
import templates from "./templates.json";
import { sampleChapterText } from "./content";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;

const KEY = "book-studio-demo-v1";
export const DEMO_USER = "00000000-0000-4000-8000-0000000000d0";
export const DEMO_EMAIL = "demo@safetyacademia.ge";

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function seed(): Tables {
  const org = "00000000-0000-4000-8000-00000000a001";
  const book = "00000000-0000-4000-8000-00000000b001";
  const author = "00000000-0000-4000-8000-0000000000d1";
  const reviewer = "00000000-0000-4000-8000-0000000000d2";
  const ch = (n: number) => `00000000-0000-4000-8000-00000000c00${n}`;
  const chapters = [
    { title_en: "Human Factors and the HFACS Model", title_ka: "ადამიანური ფაქტორები და HFACS მოდელი", goal: "Show how most light-aircraft accidents trace to decisions rather than mechanical failure.", status: "approved", revision: 0, approved_at: daysAgo(6), approved_by: DEMO_USER },
    { title_en: "Cognitive Bias in the Cockpit", title_ka: "კოგნიტური მიკერძოება კაბინაში", goal: "Help pilots recognise confirmation and plan-continuation bias before a go/no-go call.", status: "in_review", revision: null },
    { title_en: "Energy Management", title_ka: "ენერგიის მართვა", goal: "Explain total energy state as the physics behind stall/spin, unstable approaches and runway excursions.", status: "draft", revision: null },
    { title_en: "Mountain and VFR-into-IMC Threats", title_ka: "მთიანი რელიეფი და VFR-დან IMC-ში შესვლის საფრთხეები", goal: "Prepare pilots for the environmental threats specific to the Caucasus.", status: "draft", revision: null },
    { title_en: "The Training-versus-Reality Gap", title_ka: "სწავლებასა და რეალობას შორის სხვაობა", goal: "Show why checkride scenarios rarely reproduce real fatigue, weather ambiguity and distraction, and what instructors can do about it.", status: "draft", revision: null },
  ].map((c, i) => ({
    id: ch(i + 1), org_id: org, book_id: book, position: i, approved_at: null, approved_by: null,
    created_at: daysAgo(14), updated_at: daysAgo(i + 1), ...c,
  }));

  let vid = 1;
  const v = (chapter: string, lang: string, body: string, source: "author" | "ai", by: string, at: string, ai_op: string | null = null) => ({
    id: vid++, org_id: org, chapter_id: chapter, lang, body, source, ai_op, model: source === "ai" ? "claude-opus-5-5" : null,
    restored_from: null, created_by: by, created_at: at, updated_at: at,
  });
  const c1 = chapters[0], c2 = chapters[1], c3 = chapters[2];
  const versions = [
    v(c1.id, "en", sampleChapterText(c1.title_en, c1.goal, "en"), "author", author, daysAgo(10)),
    v(c1.id, "ka", sampleChapterText(c1.title_ka, c1.goal, "ka"), "ai", author, daysAgo(9), "adapt"),
    v(c2.id, "en", sampleChapterText(c2.title_en, c2.goal, "en"), "author", author, daysAgo(4)),
    v(c3.id, "en", sampleChapterText(c3.title_en, c3.goal, "en"), "ai", DEMO_USER, daysAgo(2), "draft"),
  ];

  return {
    plans: [
      { id: "pilot", name: "Pilot", seats: 10, max_books: null, ai_monthly_budget_usd: 8, exports: ["docx", "pdf", "epub", "scorm"], sort: 0 },
      { id: "starter", name: "Starter", seats: 3, max_books: 2, ai_monthly_budget_usd: 12, exports: ["docx", "pdf"], sort: 1 },
      { id: "team", name: "Team", seats: 10, max_books: null, ai_monthly_budget_usd: 40, exports: ["docx", "pdf", "epub", "scorm"], sort: 2 },
      { id: "institutional", name: "Institutional", seats: 200, max_books: null, ai_monthly_budget_usd: 150, exports: ["docx", "pdf", "epub", "scorm"], sort: 3 },
    ],
    organizations: [{
      id: org, name: "Safety Academia (demo)", brand_color: "#1F3A52", logo_path: null, plan_id: "pilot",
      subscription_status: "pilot", ai_budget_override_usd: null, stripe_customer_id: null, stripe_subscription_id: null, created_at: daysAgo(30),
    }],
    profiles: [
      { id: DEMO_USER, email: DEMO_EMAIL, full_name: "You (demo owner)", created_at: daysAgo(30) },
      { id: author, email: "author@example.com", full_name: "Sample Author", created_at: daysAgo(30) },
      { id: reviewer, email: "reviewer@example.com", full_name: "Sample Reviewer", created_at: daysAgo(30) },
    ],
    memberships: [
      { org_id: org, user_id: DEMO_USER, roles: ["owner", "author", "reviewer", "approver"], created_at: daysAgo(30) },
      { org_id: org, user_id: author, roles: ["author"], created_at: daysAgo(29) },
      { org_id: org, user_id: reviewer, roles: ["reviewer", "approver"], created_at: daysAgo(29) },
    ],
    templates: templates as Row[],
    books: [{
      id: book, org_id: org, title: "Advanced Safety in Light Aircraft Operations", subtitle: "Human factors, decision-making and energy management",
      document_ref: "SA-ASLA-01", template_id: null, languages: ["en", "ka"], primary_lang: "en", archived: false,
      created_by: DEMO_USER, created_at: daysAgo(14), updated_at: daysAgo(1),
    }],
    chapters,
    chapter_versions: versions,
    comments: [
      { id: uid(), org_id: org, chapter_id: c2.id, lang: "en", author_id: reviewer, body: "Good chapter. Before I accept it: add a real occurrence example for plan-continuation bias.", kind: "comment", resolved: false, created_at: daysAgo(2) },
    ],
    chapter_flags: [],
    sources: [
      { id: uid(), org_id: org, title: "ICAO Annex 19 — Safety Management", reference: "2nd edition", kind: "standard", url: "", excerpt: "", created_at: daysAgo(20) },
      { id: uid(), org_id: org, title: "FAA Pilot's Handbook of Aeronautical Knowledge", reference: "FAA-H-8083-25, chapter 2: Aeronautical Decision-Making", kind: "guidance", url: "https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak", excerpt: "", created_at: daysAgo(20) },
      { id: uid(), org_id: org, title: "EASA Part-FCL", reference: "Regulation (EU) No 1178/2011, Annex I", kind: "regulation", url: "", excerpt: "", created_at: daysAgo(20) },
    ],
    chapter_sources: [],
    glossary_terms: [
      { id: uid(), org_id: org, term_en: "hazard", term_ka: "საფრთხე", note: "", created_at: daysAgo(20) },
      { id: uid(), org_id: org, term_en: "risk assessment", term_ka: "რისკის შეფასება", note: "", created_at: daysAgo(20) },
      { id: uid(), org_id: org, term_en: "safety management system (SMS)", term_ka: "უსაფრთხოების მართვის სისტემა (SMS)", note: "Keep the abbreviation SMS in Latin script.", created_at: daysAgo(20) },
    ],
    ai_usage: [
      { id: 1, org_id: org, user_id: author, book_id: book, chapter_id: c1.id, op: "adapt", model: "claude-opus-5-5", input_tokens: 5200, output_tokens: 9400, cost_usd: 0.209, created_at: daysAgo(9) },
      { id: 2, org_id: org, user_id: DEMO_USER, book_id: book, chapter_id: c3.id, op: "draft", model: "claude-opus-5-5", input_tokens: 3100, output_tokens: 11800, cost_usd: 0.248, created_at: daysAgo(2) },
    ],
    audit_events: [
      { id: 1, org_id: org, book_id: book, chapter_id: null, actor_id: DEMO_USER, event: "book_created", detail: {}, created_at: daysAgo(14) },
      { id: 2, org_id: org, book_id: book, chapter_id: c1.id, actor_id: author, event: "ai_adapted", detail: { lang: "ka" }, created_at: daysAgo(9) },
      { id: 3, org_id: org, book_id: book, chapter_id: c1.id, actor_id: author, event: "chapter_submit", detail: { status: "in_review" }, created_at: daysAgo(8) },
      { id: 4, org_id: org, book_id: book, chapter_id: c1.id, actor_id: reviewer, event: "chapter_accept", detail: { status: "reviewed" }, created_at: daysAgo(7) },
      { id: 5, org_id: org, book_id: book, chapter_id: c1.id, actor_id: DEMO_USER, event: "chapter_approve", detail: { status: "approved", revision: 0 }, created_at: daysAgo(6) },
      { id: 6, org_id: org, book_id: book, chapter_id: c2.id, actor_id: author, event: "chapter_submit", detail: { status: "in_review" }, created_at: daysAgo(3) },
      { id: 7, org_id: org, book_id: book, chapter_id: c3.id, actor_id: DEMO_USER, event: "ai_drafted", detail: { lang: "en" }, created_at: daysAgo(2) },
    ],
    platform_admins: [{ user_id: DEMO_USER }],
    _files: [],
  };
}

let tables: Tables | null = null;

export function db(): Tables {
  if (tables) return tables;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) tables = JSON.parse(raw);
  } catch { /* storage unavailable: run in memory */ }
  tables ??= seed();
  return tables!;
}

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(tables));
  } catch { /* quota or private mode: keep in memory */ }
}

export function resetDemo() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY + ":session");
  } catch { /* ignore */ }
  tables = null;
}

export function nextId(table: string): number {
  return db()[table].reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
}

export function stamp(): string {
  return now();
}

export const SESSION_KEY = KEY + ":session";
