import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useOrg } from "../lib/org";
import { errorMessage } from "../lib/api";
import { fmtDate } from "../lib/format";
import { Dialog, Loading, Notice } from "../components/ui";
import type { Book, Lang, Template } from "../lib/types";

interface BookRow extends Book { chapters: { status: string }[] }

export default function Books() {
  const { org, plan, can } = useOrg();
  const [books, setBooks] = useState<BookRow[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("books").select("*, chapters(status)").eq("org_id", org.id).order("updated_at", { ascending: false });
    setBooks((data ?? []) as BookRow[]);
  }, [org.id]);
  useEffect(() => { load(); }, [load]);

  if (!books) return <Loading />;
  const visible = books.filter((b) => b.archived === showArchived);
  const active = books.filter((b) => !b.archived).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Books</h1>
          <p className="muted small">
            {active} active{plan.max_books ? ` of ${plan.max_books} allowed on the ${plan.name} plan` : ""}.
          </p>
        </div>
        <div className="row">
          <label className="check small"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
          {can("author") && <button className="btn" onClick={() => setCreating(true)}>New book</button>}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="panel">
          <p>{showArchived ? "No archived books." : "No books yet."}</p>
          {!showArchived && can("author") && (
            <p className="muted small">Start from a template such as the ATO Training Manual or OSH Course Book, or from your own notes with an empty book and the blueprint tool.</p>
          )}
        </div>
      ) : (
        <div className="grid-cards">
          {visible.map((b) => {
            const total = b.chapters.length;
            const approved = b.chapters.filter((c) => c.status === "approved").length;
            const inReview = b.chapters.filter((c) => c.status === "in_review" || c.status === "reviewed").length;
            return (
              <Link key={b.id} to={`/o/${org.id}/b/${b.id}`} className="card">
                <div className="between">
                  <span className="mono small muted">{b.document_ref || "No reference"}</span>
                  <span className="mono small muted">{b.languages.map((l) => l.toUpperCase()).join(" · ")}</span>
                </div>
                <h3>{b.title}</h3>
                {b.subtitle && <span className="muted small">{b.subtitle}</span>}
                <div className="meter" aria-label={`${approved} of ${total} chapters approved`}>
                  <i style={{ width: total ? `${(approved / total) * 100}%` : 0 }} />
                </div>
                <span className="small muted">
                  {approved}/{total} approved{inReview ? ` · ${inReview} in review` : ""} · updated {fmtDate(b.updated_at)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
      {creating && <NewBookDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewBookDialog({ onClose }: { onClose: () => void }) {
  const { org } = useOrg();
  const nav = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [ref, setRef] = useState("");
  const [template, setTemplate] = useState<string>("");
  const [langs, setLangs] = useState<Lang[]>(["en", "ka"]);
  const [primary, setPrimary] = useState<Lang>("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("templates").select("*").order("sort").then(({ data }) => setTemplates((data ?? []) as Template[]));
  }, []);

  const chosen = templates.find((t) => t.id === template);

  function toggleLang(l: Lang) {
    const next = langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l];
    if (!next.length) return;
    setLangs(next.sort() as Lang[]);
    if (!next.includes(primary)) setPrimary(next[0]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("create_book", {
      p_org: org.id,
      p_title: title.trim(),
      p_template: template || null,
      p_languages: langs,
      p_primary_lang: primary,
      p_document_ref: ref.trim(),
      p_subtitle: subtitle.trim(),
    });
    setBusy(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    nav(`/o/${org.id}/b/${(data as Book).id}`);
  }

  return (
    <Dialog title="New book" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">Title
          <input id="book-title" type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. PPL(A) Training Manual" />
        </label>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <label className="field" style={{ flex: 2, minWidth: 200 }}>Subtitle <span className="hint">Optional</span>
            <input id="book-subtitle" type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 140 }}>Document reference <span className="hint">e.g. TM-01</span>
            <input id="book-ref" type="text" value={ref} onChange={(e) => setRef(e.target.value)} />
          </label>
        </div>
        <label className="field">Start from
          <select id="book-template" value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="">Empty book (add chapters or use the blueprint from notes)</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.chapters.length} chapters</option>)}
          </select>
          {chosen && <span className="hint">{chosen.description} Check the structure against current regulation before relying on it.</span>}
        </label>
        <div className="row">
          <span className="small" style={{ fontWeight: 500 }}>Languages</span>
          <label className="check"><input type="checkbox" checked={langs.includes("en")} onChange={() => toggleLang("en")} /> English</label>
          <label className="check"><input type="checkbox" checked={langs.includes("ka")} onChange={() => toggleLang("ka")} /> ქართული</label>
          {langs.length > 1 && (
            <label className="check">Written first in
              <select id="book-primary" value={primary} onChange={(e) => setPrimary(e.target.value as Lang)} style={{ width: "auto" }}>
                <option value="en">English</option>
                <option value="ka">ქართული</option>
              </select>
            </label>
          )}
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !title.trim()}>Create book</button>
        </div>
      </form>
    </Dialog>
  );
}
