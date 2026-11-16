import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useOrg } from "../lib/org";
import { callFunction, errorMessage } from "../lib/api";
import { Dialog, Notice } from "./ui";
import type { Book, Chapter, Lang } from "../lib/types";
import { LANG_LABEL } from "../lib/types";
import type { ExportFormat } from "../export/model";

const FORMATS: { id: ExportFormat; label: string; help: string }[] = [
  { id: "docx", label: "Word (DOCX)", help: "Editable. For partners and authorities who mark up documents." },
  { id: "pdf", label: "Branded PDF", help: "Controlled-manual layout: cover, record of revisions, effective chapters, page headers." },
  { id: "epub", label: "EPUB", help: "E-book for KDP and e-readers." },
  { id: "scorm", label: "SCORM 1.2 package", help: "Upload to an LMS (Moodle and others). One tracked lesson per chapter." },
];

export function ExportDialog({ book, chapters, onClose }: { book: Book; chapters: Chapter[]; onClose: () => void }) {
  const { plan } = useOrg();
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [langs, setLangs] = useState<Lang[]>(book.languages.length > 1 ? [book.primary_lang] : book.languages);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const unapproved = chapters.filter((c) => c.status !== "approved").length;

  function setLangChoice(v: string) {
    if (v === "both") setLangs([book.primary_lang, ...book.languages.filter((l) => l !== book.primary_lang)]);
    else setLangs([v as Lang]);
  }

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const { exportBook } = await import("../export");
      const name = await exportBook(book.id, format, langs);
      setMsg({ kind: "ok", text: `Downloaded ${name}.` });
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Export book" onClose={onClose}>
      <div className="stack">
        {FORMATS.map((f) => {
          const allowed = plan.exports.includes(f.id);
          return (
            <label key={f.id} className="check" style={{ alignItems: "flex-start", opacity: allowed ? 1 : 0.5 }}>
              <input type="radio" name="format" checked={format === f.id} disabled={!allowed} onChange={() => setFormat(f.id)} />
              <span><b>{f.label}</b>{!allowed && " · not on your plan"}<br /><span className="small muted">{f.help}</span></span>
            </label>
          );
        })}
        {book.languages.length > 1 && (
          <label className="field">Languages
            <select id="export-langs" value={langs.length > 1 ? "both" : langs[0]} onChange={(e) => setLangChoice(e.target.value)}>
              {book.languages.map((l) => <option key={l} value={l}>{LANG_LABEL[l]} only</option>)}
              <option value="both">Both, side by side per chapter</option>
            </select>
          </label>
        )}
        {unapproved > 0 && (
          <Notice kind="warn">{unapproved} chapter{unapproved > 1 ? "s are" : " is"} not approved yet. The export will be marked as an uncontrolled draft.</Notice>
        )}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="row end">
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn" disabled={busy || !plan.exports.includes(format)} onClick={run}>{busy ? "Preparing…" : "Export"}</button>
        </div>
      </div>
    </Dialog>
  );
}

export function BlueprintDialog({ book, lang, onClose, onDone }: { book: Book; lang: Lang; onClose: () => void; onDone: () => void }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await callFunction("ai", { op: "blueprint", book_id: book.id, notes, goal_lang: lang });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog title="Blueprint from notes" onClose={onClose} wide>
      <form className="stack" onSubmit={run}>
        <p className="small muted" style={{ margin: 0 }}>
          Paste lecture notes, SOP fragments, old manual text or a list of topics. The AI groups them into new chapters with English and Georgian titles and a goal for each. It adds chapters to this book; it doesn't write chapter text. Structuring your own notes counts as AI-assisted, not AI-generated.
        </p>
        <textarea id="blueprint-notes" rows={14} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="- HFACS applied to GA accident review&#10;- Plan continuation bias in deteriorating weather&#10;- Energy management…" />
        {error && <Notice kind="error">{error}</Notice>}
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || notes.trim().length < 20}>{busy ? "Structuring…" : "Add chapters"}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function BookDialog({ book, onClose, onSaved }: { book: Book; onClose: () => void; onSaved: () => void }) {
  const { org, can } = useOrg();
  const nav = useNavigate();
  const [b, setB] = useState({ title: book.title, subtitle: book.subtitle, document_ref: book.document_ref });
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error: err } = await supabase.from("books").update({ ...b, updated_at: new Date().toISOString() }).eq("id", book.id);
    if (err) setError(errorMessage(err));
    else onSaved();
  }
  async function archive() {
    const { error: err } = await supabase.from("books").update({ archived: !book.archived }).eq("id", book.id);
    if (err) setError(errorMessage(err));
    else nav(`/o/${org.id}`);
  }

  return (
    <Dialog title="Book details" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <label className="field">Title<input id="bd-title" type="text" required value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} /></label>
        <label className="field">Subtitle<input id="bd-subtitle" type="text" value={b.subtitle} onChange={(e) => setB({ ...b, subtitle: e.target.value })} /></label>
        <label className="field">Document reference<input id="bd-ref" type="text" value={b.document_ref} onChange={(e) => setB({ ...b, document_ref: e.target.value })} /></label>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="between">
          {can("author") ? <button type="button" className="btn danger" onClick={archive}>{book.archived ? "Restore from archive" : "Archive book"}</button> : <span />}
          <div className="row">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn">Save</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
