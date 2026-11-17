import { useCallback, useEffect, useState, type FormEvent } from "react";
import { diffWords } from "diff";
import { supabase } from "../lib/supabase";
import { useOrg } from "../lib/org";
import { errorMessage } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { Dialog, Notice } from "./ui";
import type { AuditEvent, Chapter, Comment, Flag, Lang, Source, Version } from "../lib/types";
import { LANG_LABEL } from "../lib/types";

type Tab = "review" | "sources" | "history" | "activity";

export default function SidePanel({ chapter, lang, refresh, onChanged }: { chapter: Chapter; lang: Lang; refresh: number; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>("review");
  return (
    <aside className="panel side">
      <div className="tabs" role="tablist">
        {(["review", "sources", "history", "activity"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "review" && <Review chapter={chapter} lang={lang} refresh={refresh} />}
      {tab === "sources" && <ChapterSources chapter={chapter} />}
      {tab === "history" && <History chapter={chapter} lang={lang} refresh={refresh} onChanged={onChanged} />}
      {tab === "activity" && <Activity chapter={chapter} />}
    </aside>
  );
}

function useNames(orgId: string) {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    supabase.from("memberships").select("user_id, profiles(email, full_name)").eq("org_id", orgId).then(({ data }) => {
      const m: Record<string, string> = {};
      for (const r of (data ?? []) as unknown as { user_id: string; profiles: { email: string; full_name: string } | null }[]) {
        m[r.user_id] = r.profiles?.full_name || r.profiles?.email || "Someone";
      }
      setNames(m);
    });
  }, [orgId]);
  return names;
}

function Review({ chapter, lang, refresh }: { chapter: Chapter; lang: Lang; refresh: number }) {
  const { org } = useOrg();
  const names = useNames(org.id);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");

  const load = useCallback(async () => {
    const [f, c] = await Promise.all([
      supabase.from("chapter_flags").select("*").eq("chapter_id", chapter.id).eq("lang", lang).order("id"),
      supabase.from("comments").select("*").eq("chapter_id", chapter.id).order("created_at"),
    ]);
    setFlags((f.data ?? []) as Flag[]);
    setComments((c.data ?? []) as Comment[]);
  }, [chapter.id, lang]);
  useEffect(() => { load(); }, [load, refresh]);

  const suggestions = flags.filter((f) => f.kind === "suggest");
  const checks = flags.filter((f) => f.kind !== "suggest");

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await supabase.from("comments").insert({ org_id: org.id, chapter_id: chapter.id, lang, body: body.trim() });
    setBody("");
    load();
  }
  async function resolve(c: Comment) {
    await supabase.from("comments").update({ resolved: !c.resolved }).eq("id", c.id);
    load();
  }

  return (
    <div className="stack">
      <h2>AI suggestions · {LANG_LABEL[lang]}</h2>
      {suggestions.length ? (
        <>
          <p className="small muted" style={{ margin: 0 }}>Advice only. Make the changes in your own words; pasting AI wording into the chapter would make it AI-written.</p>
          {suggestions.map((f) => <div key={f.id} className="suggestion"><b>{f.type}.</b> {f.note}</div>)}
        </>
      ) : <p className="small muted">Use “Suggest improvements” for editorial advice while you write.</p>}
      <h2 style={{ marginTop: 8 }}>AI consistency flags · {LANG_LABEL[lang]}</h2>
      {checks.length ? checks.map((f) => <div key={f.id} className="flag"><b>{f.type}.</b> {f.note}</div>) : <p className="small muted">Run “Check consistency” to review this text.</p>}
      <h2 style={{ marginTop: 8 }}>Comments</h2>
      {comments.map((c) => (
        <div key={c.id} className={`comment ${c.kind}${c.resolved ? " resolved" : ""}`}>
          <div className="small muted">
            {names[c.author_id] ?? "Someone"} · {fmtDateTime(c.created_at)}{c.kind === "review" ? " · review note" : ""}{c.lang ? ` · ${c.lang.toUpperCase()}` : ""}
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
          <button className="linkbtn small" onClick={() => resolve(c)}>{c.resolved ? "Reopen" : "Resolve"}</button>
        </div>
      ))}
      {!comments.length && <p className="small muted">No comments yet.</p>}
      <form className="stack" onSubmit={add}>
        <textarea aria-label="New comment" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment for the author or reviewers" />
        <div><button className="btn small" disabled={!body.trim()}>Comment</button></div>
      </form>
    </div>
  );
}

function ChapterSources({ chapter }: { chapter: Chapter }) {
  const { org, can } = useOrg();
  const [all, setAll] = useState<Source[]>([]);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([
      supabase.from("sources").select("*").eq("org_id", org.id).order("title"),
      supabase.from("chapter_sources").select("source_id").eq("chapter_id", chapter.id),
    ]);
    setAll((s.data ?? []) as Source[]);
    setLinked(new Set((l.data ?? []).map((r) => r.source_id as string)));
  }, [org.id, chapter.id]);
  useEffect(() => { load(); }, [load]);

  async function toggle(s: Source) {
    setError(null);
    const res = linked.has(s.id)
      ? await supabase.from("chapter_sources").delete().eq("chapter_id", chapter.id).eq("source_id", s.id)
      : await supabase.from("chapter_sources").insert({ chapter_id: chapter.id, source_id: s.id, org_id: org.id });
    if (res.error) setError(errorMessage(res.error));
    load();
  }

  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>The AI may rely only on the sources ticked here when drafting or checking this chapter.</p>
      {error && <Notice kind="error">{error}</Notice>}
      {all.map((s) => (
        <label key={s.id} className="check" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" checked={linked.has(s.id)} disabled={!can("author")} onChange={() => toggle(s)} />
          <span>
            {s.title}
            <br />
            <span className="small muted mono">{s.reference || s.kind}{s.excerpt ? "" : " · no excerpt"}</span>
          </span>
        </label>
      ))}
      {!all.length && <p className="small muted">Your source library is empty. Add regulations and documents under “Sources & glossary”.</p>}
    </div>
  );
}

function History({ chapter, lang, refresh, onChanged }: { chapter: Chapter; lang: Lang; refresh: number; onChanged: () => void }) {
  const { org, can } = useOrg();
  const names = useNames(org.id);
  const [versions, setVersions] = useState<Version[]>([]);
  const [viewing, setViewing] = useState<Version | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("chapter_versions").select("*").eq("chapter_id", chapter.id).eq("lang", lang).order("id", { ascending: false }).limit(100);
    setVersions((data ?? []) as Version[]);
  }, [chapter.id, lang]);
  useEffect(() => { load(); }, [load, refresh]);

  const latest = versions[0];

  async function restore(v: Version) {
    const { error: err } = await supabase.rpc("restore_version", { p_version: v.id });
    if (err) setError(errorMessage(err));
    else {
      setViewing(null);
      load();
      onChanged();
    }
  }

  return (
    <div className="stack">
      {error && <Notice kind="error">{error}</Notice>}
      {versions.map((v, i) => (
        <div key={v.id} className="version">
          <div className="between">
            <span className={`pill ${v.source === "ai" ? "ai" : "original"}`}>{v.source === "ai" ? `AI ${v.ai_op}` : "Author"}</span>
            <span className="mono small muted">v{v.id}{i === 0 ? " · current" : ""}</span>
          </div>
          <span className="small">{v.source === "ai" ? `${v.model} · run by ` : ""}{names[v.created_by ?? ""] ?? "Someone"}</span>
          <span className="small muted">{fmtDateTime(v.updated_at)}{v.restored_from ? ` · restored from v${v.restored_from}` : ""}</span>
          <div><button className="linkbtn small" onClick={() => setViewing(v)}>{i === 0 ? "View" : "Compare with current"}</button></div>
        </div>
      ))}
      {!versions.length && <p className="small muted">No saved text in {LANG_LABEL[lang]} yet.</p>}
      {viewing && latest && (
        <Dialog title={`Version v${viewing.id}${viewing.id === latest.id ? " (current)" : " compared with current"}`} onClose={() => setViewing(null)} wide>
          {viewing.id === latest.id ? (
            <div className="diff">{viewing.body}</div>
          ) : (
            <>
              <p className="small muted" style={{ margin: 0 }}><del>Struck text</del> is in v{viewing.id} only; <ins>highlighted text</ins> was added since.</p>
              <div className="diff">
                {diffWords(viewing.body, latest.body).map((part, i) =>
                  part.added ? <ins key={i}>{part.value}</ins> : part.removed ? <del key={i}>{part.value}</del> : <span key={i}>{part.value}</span>
                )}
              </div>
            </>
          )}
          {viewing.id !== latest.id && can("author") && (chapter.status === "draft" || chapter.status === "changes_requested") && (
            <div className="row end">
              <span className="small muted">Restoring keeps the full history; provenance travels with the text.</span>
              <button className="btn" onClick={() => restore(viewing)}>Restore this version</button>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  chapter_submit: "submitted for review",
  chapter_accept: "accepted the review",
  chapter_request_changes: "requested changes",
  chapter_approve: "approved",
  chapter_reopen: "opened a new revision",
  ai_drafted: "drafted with AI",
  ai_adapted: "adapted with AI",
  version_restored: "restored a version",
};

function Activity({ chapter }: { chapter: Chapter }) {
  const { org } = useOrg();
  const names = useNames(org.id);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  useEffect(() => {
    supabase.from("audit_events").select("*").eq("chapter_id", chapter.id).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setEvents((data ?? []) as AuditEvent[]));
  }, [chapter.id, chapter.updated_at]);
  return (
    <div className="stack">
      {events.map((e) => (
        <div key={e.id} className="comment">
          <div className="small muted">{fmtDateTime(e.created_at)}</div>
          <div className="small">
            <b>{names[e.actor_id ?? ""] ?? "System"}</b> {EVENT_LABEL[e.event] ?? e.event.replace(/_/g, " ")}
            {typeof e.detail?.lang === "string" ? ` (${String(e.detail.lang).toUpperCase()})` : ""}
            {typeof e.detail?.revision === "number" && e.event === "chapter_approve" ? ` as Rev ${e.detail.revision}` : ""}
          </div>
          {typeof e.detail?.note === "string" && <div className="small muted">“{e.detail.note}”</div>}
        </div>
      ))}
      {!events.length && <p className="small muted">No activity yet.</p>}
    </div>
  );
}
