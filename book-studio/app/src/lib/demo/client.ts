// A small imitation of the supabase-js client, backed by the demo store.
// It supports exactly the query shapes the app uses.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { db, DEMO_EMAIL, DEMO_USER, nextId, persist, type Row, SESSION_KEY, stamp, uid } from "./store";

type Result = { data: any; error: { message: string; code?: string } | null; count?: number | null };
const ok = (data: any, count?: number): Result => ({ data, error: null, count });
const fail = (message: string, code = "42501"): Result => ({ data: null, error: { message, code } });

// Embedded relations used by the app: parent table -> embed name -> how to join.
const RELATIONS: Record<string, Record<string, { table: string; local: string; foreign: string; many: boolean }>> = {
  organizations: { plans: { table: "plans", local: "plan_id", foreign: "id", many: false } },
  books: { chapters: { table: "chapters", local: "id", foreign: "book_id", many: true } },
  memberships: {
    profiles: { table: "profiles", local: "user_id", foreign: "id", many: false },
    organizations: { table: "organizations", local: "org_id", foreign: "id", many: false },
  },
  chapter_sources: { sources: { table: "sources", local: "source_id", foreign: "id", many: false } },
};

function provenanceRows(): Row[] {
  const t = db();
  const out: Row[] = [];
  for (const c of t.chapters) {
    for (const lang of ["en", "ka"]) {
      const vs = t.chapter_versions.filter((v) => v.chapter_id === c.id && v.lang === lang).sort((a, b) => b.id - a.id);
      out.push({
        chapter_id: c.id, book_id: c.book_id, lang,
        ai_generated: vs.some((v) => v.source === "ai"),
        body: vs[0]?.body ?? null, version_id: vs[0]?.id ?? null, last_edit_at: vs[0]?.updated_at ?? null,
      });
    }
  }
  return out;
}

function splitTop(cols: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of cols) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function shape(table: string, row: Row, cols: string): Row {
  const out: Row = { ...row };
  for (const part of splitTop(cols)) {
    const m = part.match(/^(\w+)\((.*)\)$/);
    if (!m) continue;
    const rel = RELATIONS[table]?.[m[1]];
    if (!rel) continue;
    const matches = db()[rel.table].filter((r) => r[rel.foreign] === row[rel.local]).map((r) => shape(rel.table, r, m[2]));
    out[m[1]] = rel.many ? matches : (matches[0] ?? null);
  }
  return out;
}

const DEFAULTS: Record<string, () => Row> = {
  chapters: () => ({ status: "draft", revision: null, approved_at: null, approved_by: null, title_en: "", title_ka: "", goal: "", position: 0, created_at: stamp(), updated_at: stamp() }),
  comments: () => ({ author_id: DEMO_USER, kind: "comment", resolved: false, lang: null, created_at: stamp() }),
  sources: () => ({ reference: "", kind: "regulation", url: "", excerpt: "", created_at: stamp() }),
  glossary_terms: () => ({ term_en: "", term_ka: "", note: "", created_at: stamp() }),
  books: () => ({ subtitle: "", document_ref: "", archived: false, created_at: stamp(), updated_at: stamp() }),
  memberships: () => ({ created_at: stamp() }),
};

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private cols = "*";
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private payload: any = null;
  private returning = false;
  private head = false;

  constructor(private table: string) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.cols = cols; else this.returning = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.op = "insert"; this.payload = rows; return this; }
  upsert(row: Row) { this.op = "upsert"; this.payload = row; return this; }
  update(patch: Row) { this.op = "update"; this.payload = patch; return this; }
  delete() { this.op = "delete"; return this; }
  eq(col: string, v: any) { this.filters.push((r) => r[col] === v); return this; }
  in(col: string, vs: any[]) { this.filters.push((r) => vs.includes(r[col])); return this; }
  gte(col: string, v: any) { this.filters.push((r) => r[col] >= v); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orders.push({ col, asc: o?.ascending !== false }); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  then<A = Result, B = never>(res?: ((v: Result) => A | PromiseLike<A>) | null, rej?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return new Promise<Result>((resolve) => setTimeout(() => resolve(this.run()), 60)).then(res, rej);
  }

  private source(): Row[] {
    if (this.table === "chapter_provenance") return provenanceRows();
    return db()[this.table] ?? [];
  }

  private finish(rows: Row[]): Result {
    let out = rows.map((r) => shape(this.table, r, this.cols));
    for (const o of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => (a[o.col] < b[o.col] ? -1 : a[o.col] > b[o.col] ? 1 : 0) * (o.asc ? 1 : -1));
    }
    if (this.lim !== null) out = out.slice(0, this.lim);
    if (this.head) return ok(null, out.length);
    if (this.mode === "single") return out.length === 1 ? ok(out[0]) : fail("Row not found", "PGRST116");
    if (this.mode === "maybe") return ok(out[0] ?? null);
    return ok(out, out.length);
  }

  private run(): Result {
    const t = db();
    const match = (r: Row) => this.filters.every((f) => f(r));
    if (this.op === "select") return this.finish(this.source().filter(match));

    if (this.op === "insert" || this.op === "upsert") {
      const items: Row[] = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p: Row) => ({
        ...(DEFAULTS[this.table]?.() ?? { created_at: stamp() }),
        ...p,
      }));
      for (const it of items) {
        if (this.table === "chapter_sources" || this.table === "memberships") {
          const key = this.table === "memberships" ? ["org_id", "user_id"] : ["chapter_id", "source_id"];
          const existing = t[this.table].find((r) => key.every((k) => r[k] === it[k]));
          if (existing) { Object.assign(existing, it); continue; }
        } else if (it.id === undefined) {
          it.id = typeof t[this.table][0]?.id === "number" ? nextId(this.table) : uid();
        }
        t[this.table].push(it);
      }
      persist();
      return this.returning ? this.finish(items) : ok(null);
    }

    const rows = t[this.table].filter(match);
    if (this.op === "update") {
      if (this.table === "chapters" && rows.some((r) => r.status === "approved") &&
          ["title_en", "title_ka", "goal"].some((k) => k in this.payload)) {
        return fail("chapter is approved and locked; open a new revision first");
      }
      for (const r of rows) Object.assign(r, this.payload, this.table === "chapters" ? { updated_at: stamp() } : {});
      persist();
      return this.returning ? this.finish(rows) : ok(null);
    }
    t[this.table] = t[this.table].filter((r) => !match(r));
    persist();
    return ok(null);
  }
}

// ---------------------------------------------------------------------------
// RPCs: same rules as the SQL functions.

function log(org: string, book: string | null, chapter: string | null, event: string, detail: Row = {}) {
  db().audit_events.push({ id: nextId("audit_events"), org_id: org, book_id: book, chapter_id: chapter, actor_id: DEMO_USER, event, detail, created_at: stamp() });
}

export function addVersion(v: Row): Row {
  const row = { id: nextId("chapter_versions"), restored_from: null, ai_op: null, model: null, created_by: DEMO_USER, created_at: stamp(), updated_at: stamp(), ...v };
  db().chapter_versions.push(row);
  return row;
}

function rpc(name: string, a: Row): Result {
  const t = db();
  switch (name) {
    case "is_platform_admin":
    case "has_role":
      return ok(true);
    case "org_ai_budget": {
      const o = t.organizations.find((x) => x.id === a.p_org);
      const p = t.plans.find((x) => x.id === o?.plan_id);
      return ok(o?.ai_budget_override_usd ?? p?.ai_monthly_budget_usd ?? 0);
    }
    case "org_ai_spend_this_month": {
      const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
      return ok(t.ai_usage.filter((u) => u.org_id === a.p_org && u.created_at >= start.toISOString()).reduce((s, u) => s + Number(u.cost_usd), 0));
    }
    case "save_draft": {
      const c = t.chapters.find((x) => x.id === a.p_chapter);
      if (!c) return fail("not allowed");
      if (!["draft", "changes_requested"].includes(c.status)) return fail(`chapter is ${c.status} and cannot be edited`);
      const last = t.chapter_versions.filter((v) => v.chapter_id === c.id && v.lang === a.p_lang).sort((x, y) => y.id - x.id)[0];
      if (last && last.body === a.p_body) return ok(last);
      let row: Row;
      if (last && last.source === "author" && last.created_by === DEMO_USER && !last.restored_from && Date.now() - Date.parse(last.created_at) < 600_000) {
        Object.assign(last, { body: a.p_body, updated_at: stamp() });
        row = last;
      } else {
        row = addVersion({ org_id: c.org_id, chapter_id: c.id, lang: a.p_lang, body: a.p_body, source: "author" });
      }
      const b = t.books.find((x) => x.id === c.book_id);
      if (b) b.updated_at = stamp();
      persist();
      return ok(row);
    }
    case "restore_version": {
      const v = t.chapter_versions.find((x) => x.id === a.p_version);
      if (!v) return fail("not allowed");
      const c = t.chapters.find((x) => x.id === v.chapter_id)!;
      if (!["draft", "changes_requested"].includes(c.status)) return fail(`chapter is ${c.status} and cannot be edited`);
      const row = addVersion({ org_id: v.org_id, chapter_id: v.chapter_id, lang: v.lang, body: v.body, source: v.source, ai_op: v.ai_op, model: v.model, restored_from: v.id });
      log(v.org_id, c.book_id, c.id, "version_restored", { lang: v.lang, from_version: v.id });
      persist();
      return ok(row);
    }
    case "chapter_transition": {
      const c = t.chapters.find((x) => x.id === a.p_chapter);
      if (!c) return fail("not allowed");
      const note = String(a.p_note ?? "").trim();
      const action = a.p_action;
      let next: string;
      if (action === "submit") {
        if (!["draft", "changes_requested"].includes(c.status)) return fail(`chapter is ${c.status}`, "22023");
        const hasText = provenanceRows().some((p) => p.chapter_id === c.id && (p.body ?? "").trim());
        if (!hasText) return fail("write the chapter before submitting it", "22023");
        next = "in_review";
      } else if (action === "accept") {
        if (c.status !== "in_review") return fail(`chapter is ${c.status}`, "22023");
        next = "reviewed";
      } else if (action === "request_changes") {
        if (!["in_review", "reviewed"].includes(c.status)) return fail(`chapter is ${c.status}`, "22023");
        if (!note) return fail("say what needs to change", "22023");
        next = "changes_requested";
      } else if (action === "approve") {
        if (c.status !== "reviewed") return fail("chapter must be reviewed before approval", "22023");
        next = "approved";
      } else if (action === "reopen") {
        if (c.status !== "approved") return fail("chapter is not approved", "22023");
        if (!note) return fail("give a reason for the new revision", "22023");
        next = "draft";
      } else return fail("unknown action", "22023");
      c.status = next;
      if (next === "approved") {
        c.revision = c.revision === null ? 0 : c.revision + 1;
        c.approved_at = stamp();
        c.approved_by = DEMO_USER;
      }
      c.updated_at = stamp();
      if (note) t.comments.push({ id: uid(), org_id: c.org_id, chapter_id: c.id, lang: null, author_id: DEMO_USER, body: note, kind: "review", resolved: false, created_at: stamp() });
      log(c.org_id, c.book_id, c.id, `chapter_${action}`, { status: next, revision: c.revision, note: note || undefined });
      persist();
      return ok(c);
    }
    case "create_book": {
      const o = t.organizations.find((x) => x.id === a.p_org)!;
      const p = t.plans.find((x) => x.id === o.plan_id)!;
      if (p.max_books !== null && t.books.filter((b) => b.org_id === o.id && !b.archived).length >= p.max_books) {
        return fail(`your plan allows ${p.max_books} active books; archive one or upgrade`, "53400");
      }
      const b = {
        id: uid(), org_id: o.id, title: a.p_title, subtitle: a.p_subtitle ?? "", document_ref: a.p_document_ref ?? "",
        template_id: a.p_template ?? null, languages: a.p_languages ?? ["en", "ka"], primary_lang: a.p_primary_lang ?? "en",
        archived: false, created_by: DEMO_USER, created_at: stamp(), updated_at: stamp(),
      };
      t.books.push(b);
      const tpl = t.templates.find((x) => x.id === a.p_template);
      (tpl?.chapters ?? []).forEach((c: Row, i: number) =>
        t.chapters.push({ id: uid(), org_id: o.id, book_id: b.id, position: i, title_en: c.title_en, title_ka: c.title_ka, goal: c.goal, status: "draft", revision: null, approved_at: null, approved_by: null, created_at: stamp(), updated_at: stamp() })
      );
      log(o.id, b.id, null, "book_created", { template: a.p_template ?? null });
      persist();
      return ok(b);
    }
    default:
      return fail(`${name} is not available in the demo`);
  }
}

// ---------------------------------------------------------------------------

type Listener = (event: string, session: any) => void;
const listeners = new Set<Listener>();

function readSession(): any {
  try {
    return localStorage.getItem(SESSION_KEY) ? demoSession() : null;
  } catch {
    return memSession;
  }
}
let memSession: any = null;
function demoSession() {
  return { access_token: "demo", user: { id: DEMO_USER, email: DEMO_EMAIL } };
}
function setSession(on: boolean) {
  memSession = on ? demoSession() : null;
  try {
    if (on) localStorage.setItem(SESSION_KEY, "1"); else localStorage.removeItem(SESSION_KEY);
  } catch { /* in-memory only */ }
  listeners.forEach((l) => l(on ? "SIGNED_IN" : "SIGNED_OUT", memSession));
}

const files = (): Row[] => db()._files;

export function createDemoClient(): any {
  return {
    from: (table: string) => new Query(table),
    rpc: (name: string, args: Row = {}) => new Promise<Result>((r) => setTimeout(() => r(rpc(name, args)), 80)),
    auth: {
      getSession: async () => ({ data: { session: readSession() } }),
      getUser: async () => ({ data: { user: readSession()?.user ?? null } }),
      onAuthStateChange: (cb: Listener) => {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      signInWithPassword: async () => { setSession(true); return { data: {}, error: null }; },
      signInWithOtp: async () => { setSession(true); return { data: {}, error: null }; },
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ data: {}, error: null }),
      signOut: async () => { setSession(false); return { error: null }; },
    },
    storage: {
      from: () => ({
        upload: async (path: string, file: Blob) => {
          const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file); });
          files().push({ path, url });
          persist();
          return { data: { path }, error: null };
        },
        createSignedUrl: async (path: string) => ({ data: { signedUrl: files().find((f) => f.path === path)?.url ?? null }, error: null }),
        download: async (path: string) => {
          const f = files().find((x) => x.path === path);
          return { data: f ? await (await fetch(f.url)).blob() : null, error: null };
        },
        remove: async (paths: string[]) => { db()._files = files().filter((f) => !paths.includes(f.path)); persist(); return { error: null }; },
      }),
    },
  };
}
