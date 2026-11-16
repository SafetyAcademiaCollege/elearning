import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useOrg } from "../lib/org";
import { errorMessage } from "../lib/api";
import { Loading, Notice, StatusPill } from "../components/ui";
import Workspace from "../components/Workspace";
import SidePanel from "../components/SidePanel";
import { BlueprintDialog, BookDialog, ExportDialog } from "../components/StudioDialogs";
import { type Book, type Chapter, chapterTitle, type Lang, LANG_SHORT, type Provenance } from "../lib/types";

export type ProvMap = Record<string, Partial<Record<Lang, Provenance>>>;

export default function Studio() {
  const { bookId } = useParams();
  const { org, can } = useOrg();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [prov, setProv] = useState<ProvMap>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"export" | "blueprint" | "book" | null>(null);

  const load = useCallback(async () => {
    const [b, c, p] = await Promise.all([
      supabase.from("books").select("*").eq("id", bookId!).maybeSingle(),
      supabase.from("chapters").select("*").eq("book_id", bookId!).order("position"),
      supabase.from("chapter_provenance").select("*").eq("book_id", bookId!),
    ]);
    if (b.error || !b.data) {
      setError("Book not found, or you don't have access.");
      return;
    }
    setBook(b.data as Book);
    setChapters((c.data ?? []) as Chapter[]);
    const map: ProvMap = {};
    for (const row of (p.data ?? []) as Provenance[]) (map[row.chapter_id] ??= {})[row.lang] = row;
    setProv(map);
    setActiveId((cur) => cur ?? (c.data?.[0]?.id ?? null));
  }, [bookId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (book) setLang(book.primary_lang); }, [book?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = useMemo(() => chapters.find((c) => c.id === activeId) ?? null, [chapters, activeId]);

  async function addChapter() {
    const position = chapters.reduce((m, c) => Math.max(m, c.position + 1), 0);
    const { data, error: err } = await supabase
      .from("chapters")
      .insert({ org_id: org.id, book_id: bookId, position, title_en: "New chapter", title_ka: "ახალი თავი", goal: "" })
      .select()
      .single();
    if (err) return setError(errorMessage(err));
    await load();
    setActiveId((data as Chapter).id);
  }

  async function move(c: Chapter, dir: -1 | 1) {
    const idx = chapters.findIndex((x) => x.id === c.id);
    const other = chapters[idx + dir];
    if (!other) return;
    await Promise.all([
      supabase.from("chapters").update({ position: other.position }).eq("id", c.id),
      supabase.from("chapters").update({ position: c.position }).eq("id", other.id),
    ]);
    load();
  }

  if (error && !book) return <div className="page-msg">{error}</div>;
  if (!book) return <Loading />;

  const approved = chapters.filter((c) => c.status === "approved").length;

  return (
    <div className="page" style={{ maxWidth: 1500 }}>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="small muted"><Link to={`/o/${org.id}`}>Books</Link> / <span className="mono">{book.document_ref || "No reference"}</span></div>
          <h1>{book.title}</h1>
          <div className="small muted">{approved} of {chapters.length} chapters approved</div>
        </div>
        <div className="row">
          {book.languages.length > 1 && (
            <div className="seg" role="group" aria-label="Working language">
              {book.languages.map((l) => (
                <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{LANG_SHORT[l]}</button>
              ))}
            </div>
          )}
          {can("author") && <button className="btn ghost" onClick={() => setDialog("book")}>Book details</button>}
          {can("author") && <button className="btn ghost" onClick={() => setDialog("blueprint")}>Blueprint from notes</button>}
          <button className="btn secondary" onClick={() => setDialog("export")}>Export</button>
        </div>
      </div>
      {error && <Notice kind="error">{error}</Notice>}

      <div className="studio">
        <aside className="panel">
          <h2>Chapters</h2>
          <div className="chapter-list">
            {chapters.map((c, i) => (
              <div key={c.id} className="row" style={{ flexWrap: "nowrap", alignItems: "stretch", gap: 4 }}>
                <button className={`chapter-row${c.id === activeId ? " active" : ""}`} onClick={() => setActiveId(c.id)}>
                  <span className="n">CH {String(i + 1).padStart(2, "0")}{c.revision !== null ? ` · Rev ${c.revision}` : ""}</span>
                  <span className="tt" lang={lang}>{chapterTitle(c, lang)}</span>
                  <span className="dots">
                    <StatusPill status={c.status} />
                    {book.languages.map((l) => {
                      const p = prov[c.id]?.[l];
                      const has = !!p?.body?.trim();
                      const cls = !has ? "none" : p?.ai_generated ? "ai" : "original";
                      return <span key={l} className={`pill ${cls}`} title={!has ? "Not written" : p?.ai_generated ? "AI-generated" : "Author-written"}>{LANG_SHORT[l]} {!has ? "—" : p?.ai_generated ? "AI" : "orig"}</span>;
                    })}
                  </span>
                </button>
                {can("author") && (
                  <span className="stack" style={{ gap: 2 }}>
                    <button className="btn ghost small" aria-label="Move up" disabled={i === 0} onClick={() => move(c, -1)}>↑</button>
                    <button className="btn ghost small" aria-label="Move down" disabled={i === chapters.length - 1} onClick={() => move(c, 1)}>↓</button>
                  </span>
                )}
              </div>
            ))}
            {!chapters.length && <p className="small muted">No chapters yet. Add one, or turn your notes into a structure with “Blueprint from notes”.</p>}
          </div>
          {can("author") && <button className="btn ghost small" style={{ marginTop: 10 }} onClick={addChapter}>+ Add chapter</button>}
        </aside>

        {active ? (
          <Workspace key={`${active.id}:${lang}`} book={book} chapter={active} lang={lang} prov={prov[active.id] ?? {}} onChanged={load} onLang={setLang} />
        ) : (
          <section className="panel page-msg">Select or add a chapter to start writing.</section>
        )}

        {active && <SidePanel key={active.id} chapter={active} lang={lang} onChanged={load} />}
      </div>

      {dialog === "export" && <ExportDialog book={book} chapters={chapters} onClose={() => setDialog(null)} />}
      {dialog === "blueprint" && <BlueprintDialog book={book} lang={lang} onClose={() => setDialog(null)} onDone={() => { setDialog(null); load(); }} />}
      {dialog === "book" && <BookDialog book={book} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />}
    </div>
  );
}
