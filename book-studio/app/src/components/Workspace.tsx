import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useOrg } from "../lib/org";
import { callFunction, errorMessage, streamProse } from "../lib/api";
import { citationGaps, wordCount } from "../lib/text";
import { fmtDateTime } from "../lib/format";
import { Dialog, Notice, StatusPill } from "./ui";
import { type Book, type Chapter, type Lang, LANG_LABEL, type Provenance } from "../lib/types";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export default function Workspace({ book, chapter, lang, prov, onChanged, onLang }: {
  book: Book;
  chapter: Chapter;
  lang: Lang;
  prov: Partial<Record<Lang, Provenance>>;
  onChanged: () => Promise<void> | void;
  onLang: (l: Lang) => void;
}) {
  const { can } = useOrg();
  const current = prov[lang];
  const [text, setText] = useState(current?.body ?? "");
  const [save, setSave] = useState<SaveState>("idle");
  const [busy, setBusy] = useState<null | "draft" | "adapt" | "check" | "suggest" | "workflow">(null);
  const [msg, setMsg] = useState<{ kind: "error" | "ok" | "info" | "warn"; text: string } | null>(null);
  const [titles, setTitles] = useState({ title_en: chapter.title_en, title_ka: chapter.title_ka, goal: chapter.goal });
  const [noteFor, setNoteFor] = useState<null | "request_changes" | "reopen">(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(text);
  const abort = useRef<AbortController | null>(null);

  const editableStatus = chapter.status === "draft" || chapter.status === "changes_requested";
  const canEdit = can("author") && editableStatus && busy !== "draft" && busy !== "adapt";
  const other: Lang = lang === "en" ? "ka" : "en";
  const hasOther = book.languages.includes(other);
  const otherText = prov[other]?.body ?? "";

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    abort.current?.abort();
  }, []);

  // Flush unsaved text when leaving the chapter.
  useEffect(() => () => {
    if (latest.current !== (current?.body ?? "") && editableStatus && can("author")) {
      supabase.rpc("save_draft", { p_chapter: chapter.id, p_lang: lang, p_body: latest.current });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(body: string) {
    setSave("saving");
    const { error } = await supabase.rpc("save_draft", { p_chapter: chapter.id, p_lang: lang, p_body: body });
    if (error) {
      setSave("error");
      setMsg({ kind: "error", text: `Not saved: ${errorMessage(error)}` });
    } else {
      setSave("saved");
      onChanged();
    }
  }

  function onType(v: string) {
    setText(v);
    latest.current = v;
    setSave("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => persist(v), 1500);
  }

  async function saveTitles() {
    if (titles.title_en === chapter.title_en && titles.title_ka === chapter.title_ka && titles.goal === chapter.goal) return;
    const { error } = await supabase.from("chapters").update(titles).eq("id", chapter.id);
    if (error) setMsg({ kind: "error", text: errorMessage(error) });
    else onChanged();
  }

  async function runProse(op: "draft" | "adapt") {
    window.clearTimeout(timer.current);
    if (save === "dirty") await persist(latest.current);
    setBusy(op);
    setMsg({ kind: "info", text: op === "draft" ? "Drafting… text appears as it's written." : `Adapting from ${LANG_LABEL[other]}…` });
    abort.current = new AbortController();
    try {
      const body = op === "draft"
        ? { op: "draft" as const, chapter_id: chapter.id, lang }
        : { op: "adapt" as const, chapter_id: chapter.id, from: other, to: lang };
      const done = await streamProse(body, (t) => setText(t), abort.current.signal);
      setMsg({
        kind: done.truncated ? "warn" : "ok",
        text: done.truncated
          ? "The AI hit its length limit; the end of the chapter may be cut off. Edit it or split the chapter."
          : "Draft saved. This language version is now recorded as AI-generated. Review every claim before submitting.",
      });
      await onChanged();
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err) });
      setText(latest.current);
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setBusy("check");
    setMsg(null);
    try {
      const r = await callFunction<{ flags: unknown[] }>("ai", { op: "check", chapter_id: chapter.id, lang });
      setMsg({ kind: r.flags.length ? "warn" : "ok", text: r.flags.length ? `${r.flags.length} issue(s) flagged. See Review on the right.` : "No issues found." });
      onChanged();
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function suggest() {
    window.clearTimeout(timer.current);
    if (save === "dirty") await persist(latest.current);
    setBusy("suggest");
    setMsg(null);
    try {
      const r = await callFunction<{ suggestions: unknown[] }>("ai", { op: "suggest", chapter_id: chapter.id, lang });
      setMsg({
        kind: "ok",
        text: r.suggestions.length
          ? `${r.suggestions.length} suggestion(s) under Review. Apply them in your own words and the chapter stays author-original.`
          : "No suggestions: the AI found nothing to improve.",
      });
      onChanged();
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function transition(action: string, note = "") {
    window.clearTimeout(timer.current);
    if (save === "dirty") await persist(latest.current);
    setBusy("workflow");
    const { error } = await supabase.rpc("chapter_transition", { p_chapter: chapter.id, p_action: action, p_note: note });
    setBusy(null);
    if (error) setMsg({ kind: "error", text: errorMessage(error) });
    else {
      setMsg(null);
      onChanged();
    }
  }

  const status = !text.trim() ? "none" : current?.ai_generated ? "ai" : "original";
  const gaps = citationGaps(text);
  const saveLabel = { idle: "", dirty: "Unsaved changes", saving: "Saving…", saved: "Saved", error: "Save failed" }[save];

  return (
    <section className="panel stack" style={{ gap: 12 }}>
      <div className="between" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }} className="stack">
          <input
            className="ws-title"
            aria-label="Chapter title in English"
            value={titles.title_en}
            disabled={!can("author") || chapter.status === "approved"}
            onChange={(e) => setTitles({ ...titles, title_en: e.target.value })}
            onBlur={saveTitles}
          />
          {book.languages.includes("ka") && (
            <input
              className="ws-title"
              lang="ka"
              style={{ fontSize: 16, fontWeight: 500 }}
              aria-label="Chapter title in Georgian"
              value={titles.title_ka}
              disabled={!can("author") || chapter.status === "approved"}
              onChange={(e) => setTitles({ ...titles, title_ka: e.target.value })}
              onBlur={saveTitles}
            />
          )}
          <textarea
            aria-label="Chapter goal"
            rows={2}
            placeholder="Goal: what must this chapter achieve for the reader?"
            value={titles.goal}
            disabled={!can("author") || chapter.status === "approved"}
            onChange={(e) => setTitles({ ...titles, goal: e.target.value })}
            onBlur={saveTitles}
            style={{ fontSize: 13 }}
          />
        </div>
        <div className="stack" style={{ alignItems: "flex-end", gap: 6 }}>
          <StatusPill status={chapter.status} />
          <span className={`pill ${status}`}>
            {status === "none" ? "Not started" : status === "ai" ? "AI-generated" : "Author-original"} · {LANG_LABEL[lang]}
          </span>
        </div>
      </div>

      {status === "ai" && (
        <p className="small muted" style={{ margin: 0 }}>
          AI drafted or translated this language version. Book Studio keeps it recorded as AI-generated however much you edit it. Exports show this only if you include the authorship record; answer publishers' AI questions (such as Amazon KDP's) accordingly.
        </p>
      )}

      <textarea
        className="editor"
        lang={lang}
        aria-label={`Chapter text in ${LANG_LABEL[lang]}`}
        value={text}
        readOnly={!canEdit}
        onChange={(e) => onType(e.target.value)}
        placeholder={canEdit ? "Write here, or paste notes and use “Draft with AI” to expand them. Use a blank line between paragraphs, “## ” for subheadings and “- ” for bullets." : ""}
      />

      <div className="between small muted">
        <span>
          {wordCount(text).toLocaleString()} words
          {gaps ? <> · <b style={{ color: "var(--alert)" }}>{gaps} citation gap{gaps > 1 ? "s" : ""}</b></> : null}
          {current?.last_edit_at ? ` · last edit ${fmtDateTime(current.last_edit_at)}` : ""}
        </span>
        <span aria-live="polite">{saveLabel}</span>
      </div>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="row">
        {can("author") && editableStatus && (
          <button
            className="btn secondary"
            disabled={!!busy}
            title="The AI advises; you write. The chapter stays author-original."
            onClick={suggest}
          >
            {busy === "suggest" ? "Thinking…" : text.trim() ? "Suggest improvements" : "Suggest what to cover"}
          </button>
        )}
        {can("author") && editableStatus && (
          <>
            <button className="btn" disabled={!!busy} title="The AI writes the text. This language version becomes AI-generated." onClick={() => runProse("draft")}>
              {busy === "draft" ? "Drafting…" : text.trim() ? "Expand with AI" : "Draft with AI"}
            </button>
            {hasOther && (
              <button
                className="btn ghost"
                disabled={!!busy || !otherText.trim()}
                title={!otherText.trim() ? `Write the ${LANG_LABEL[other]} version first` : ""}
                onClick={() => runProse("adapt")}
              >
                {busy === "adapt" ? "Adapting…" : `Adapt from ${LANG_LABEL[other]}`}
              </button>
            )}
          </>
        )}
        <button className="btn ghost" disabled={!!busy || !text.trim()} onClick={check}>
          {busy === "check" ? "Checking…" : "Check consistency"}
        </button>
        {(busy === "draft" || busy === "adapt") && <button className="btn ghost" onClick={() => abort.current?.abort()}>Stop watching</button>}
        {hasOther && <button className="linkbtn small" onClick={() => onLang(other)}>Switch to {LANG_LABEL[other]}</button>}
      </div>

      {can("author") && editableStatus && (
        <p className="small muted" style={{ margin: 0 }}>
          <b>Suggest</b>: the AI advises and you write, so the chapter stays author-original. <b>Draft / Adapt</b>: the AI writes, so this language version is recorded as AI-generated.
        </p>
      )}

      <div className="workflow">
        <span className="small"><b>Workflow:</b></span>
        {(chapter.status === "draft" || chapter.status === "changes_requested") && can("author") && (
          <button className="btn small" disabled={!!busy} onClick={() => transition("submit")}>Submit for review</button>
        )}
        {chapter.status === "in_review" && can("reviewer") && (
          <button className="btn small" disabled={!!busy} onClick={() => transition("accept")}>Accept review</button>
        )}
        {(chapter.status === "in_review" || chapter.status === "reviewed") && (can("reviewer") || can("approver")) && (
          <button className="btn ghost small" disabled={!!busy} onClick={() => setNoteFor("request_changes")}>Request changes</button>
        )}
        {chapter.status === "reviewed" && can("approver") && (
          <button className="btn small" disabled={!!busy} onClick={() => transition("approve")}>Approve and lock</button>
        )}
        {chapter.status === "approved" && can("approver") && (
          <button className="btn ghost small" disabled={!!busy} onClick={() => setNoteFor("reopen")}>Open new revision</button>
        )}
        <span className="small muted">
          {chapter.status === "draft" && "Authors write, then submit for review."}
          {chapter.status === "changes_requested" && "Changes were requested; see Review. Resubmit when done."}
          {chapter.status === "in_review" && "Waiting for a reviewer."}
          {chapter.status === "reviewed" && "Reviewed; waiting for an approver."}
          {chapter.status === "approved" && `Approved and locked as Rev ${chapter.revision} on ${fmtDateTime(chapter.approved_at)}.`}
        </span>
      </div>

      {noteFor && (
        <NoteDialog
          title={noteFor === "reopen" ? "Open a new revision" : "Request changes"}
          label={noteFor === "reopen" ? "Reason for the revision (appears in the Record of Revisions)" : "What needs to change?"}
          onClose={() => setNoteFor(null)}
          onSubmit={(note) => { setNoteFor(null); transition(noteFor, note); }}
        />
      )}
    </section>
  );
}

function NoteDialog({ title, label, onClose, onSubmit }: { title: string; label: string; onClose: () => void; onSubmit: (n: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Dialog title={title} onClose={onClose}>
      <label className="field">{label}
        <textarea id="workflow-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      </label>
      <div className="row end">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!note.trim()} onClick={() => onSubmit(note.trim())}>Confirm</button>
      </div>
    </Dialog>
  );
}
