import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useOrg } from "../lib/org";
import { errorMessage } from "../lib/api";
import { Dialog, Loading, Notice } from "../components/ui";
import type { GlossaryTerm, Source } from "../lib/types";

const KINDS: Source["kind"][] = ["regulation", "standard", "guidance", "internal", "other"];

export default function Library() {
  const [tab, setTab] = useState<"sources" | "glossary">("sources");
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Sources & glossary</h1>
          <p className="muted small">The AI may only rely on sources linked to a chapter, and it uses your glossary terms exactly.</p>
        </div>
        <div className="seg">
          <button className={tab === "sources" ? "on" : ""} onClick={() => setTab("sources")}>Sources</button>
          <button className={tab === "glossary" ? "on" : ""} onClick={() => setTab("glossary")}>Glossary</button>
        </div>
      </div>
      {tab === "sources" ? <Sources /> : <Glossary />}
    </div>
  );
}

function Sources() {
  const { org, can } = useOrg();
  const [rows, setRows] = useState<Source[] | null>(null);
  const [editing, setEditing] = useState<Partial<Source> | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("sources").select("*").eq("org_id", org.id).order("title");
    setRows((data ?? []) as Source[]);
  }, [org.id]);
  useEffect(() => { load(); }, [load]);

  if (!rows) return <Loading />;
  const shown = rows.filter((s) => `${s.title} ${s.reference}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stack">
      <div className="row">
        <input type="text" placeholder="Search sources" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} aria-label="Search sources" />
        <span className="spacer" style={{ flex: 1 }} />
        {can("author") && <button className="btn" onClick={() => setEditing({ kind: "regulation" })}>Add source</button>}
      </div>
      <div className="panel table-wrap">
        <table className="list">
          <thead><tr><th>Title</th><th>Reference</th><th>Type</th><th>Excerpt</th><th /></tr></thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id}>
                <td>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</td>
                <td className="mono small">{s.reference || "—"}</td>
                <td>{s.kind}</td>
                <td className="small muted">{s.excerpt ? `${s.excerpt.length.toLocaleString()} characters` : "None: AI may name it but not quote it"}</td>
                <td>{can("author") && <button className="linkbtn" onClick={() => setEditing(s)}>Edit</button>}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={5} className="muted">No sources yet. Add the regulations, standards and internal documents your manuals rely on.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <SourceDialog value={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function SourceDialog({ value, onClose, onSaved }: { value: Partial<Source>; onClose: () => void; onSaved: () => void }) {
  const { org } = useOrg();
  const [s, setS] = useState<Partial<Source>>(value);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = { title: s.title?.trim() ?? "", reference: s.reference ?? "", kind: s.kind ?? "regulation", url: s.url ?? "", excerpt: s.excerpt ?? "" };
    const res = s.id
      ? await supabase.from("sources").update(payload).eq("id", s.id)
      : await supabase.from("sources").insert({ ...payload, org_id: org.id });
    setBusy(false);
    if (res.error) setError(errorMessage(res.error));
    else onSaved();
  }

  async function remove() {
    if (!s.id) return;
    const res = await supabase.from("sources").delete().eq("id", s.id);
    if (res.error) setError(errorMessage(res.error));
    else onSaved();
  }

  return (
    <Dialog title={s.id ? "Edit source" : "Add source"} onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <label className="field" style={{ flex: 2, minWidth: 220 }}>Title
            <input id="src-title" type="text" required value={s.title ?? ""} onChange={(e) => setS({ ...s, title: e.target.value })} placeholder="ICAO Annex 19 — Safety Management" />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>Type
            <select id="src-kind" value={s.kind} onChange={(e) => setS({ ...s, kind: e.target.value as Source["kind"] })}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <label className="field" style={{ flex: 1, minWidth: 200 }}>Reference <span className="hint">Edition, amendment, paragraph</span>
            <input id="src-ref" type="text" value={s.reference ?? ""} onChange={(e) => setS({ ...s, reference: e.target.value })} placeholder="2nd edition, July 2016" />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 200 }}>Link <span className="hint">Optional</span>
            <input id="src-url" type="url" value={s.url ?? ""} onChange={(e) => setS({ ...s, url: e.target.value })} />
          </label>
        </div>
        <label className="field">Excerpt
          <span className="hint">Paste the paragraphs the AI should work from (up to 40,000 characters). Only paste text you're licensed to use. Without an excerpt the AI can name this source but won't paraphrase its requirements.</span>
          <textarea id="src-excerpt" rows={10} value={s.excerpt ?? ""} maxLength={40000} onChange={(e) => setS({ ...s, excerpt: e.target.value })} />
        </label>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="between">
          {s.id ? <button type="button" className="btn danger" onClick={remove}>Delete source</button> : <span />}
          <div className="row">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn" disabled={busy}>Save</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function Glossary() {
  const { org, can } = useOrg();
  const [rows, setRows] = useState<GlossaryTerm[] | null>(null);
  const [draft, setDraft] = useState({ term_en: "", term_ka: "", note: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("glossary_terms").select("*").eq("org_id", org.id).order("term_en");
    setRows((data ?? []) as GlossaryTerm[]);
  }, [org.id]);
  useEffect(() => { load(); }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await supabase.from("glossary_terms").insert({ ...draft, org_id: org.id });
    if (res.error) setError(errorMessage(res.error));
    else {
      setDraft({ term_en: "", term_ka: "", note: "" });
      load();
    }
  }
  async function remove(id: string) {
    await supabase.from("glossary_terms").delete().eq("id", id);
    load();
  }

  if (!rows) return <Loading />;
  return (
    <div className="stack">
      {can("author") && (
        <form className="panel row" onSubmit={add} style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>English
            <input id="g-en" type="text" value={draft.term_en} onChange={(e) => setDraft({ ...draft, term_en: e.target.value })} placeholder="go-around" />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>ქართული
            <input id="g-ka" type="text" lang="ka" value={draft.term_ka} onChange={(e) => setDraft({ ...draft, term_ka: e.target.value })} />
          </label>
          <label className="field" style={{ flex: 2, minWidth: 200 }}>Note <span className="hint">Usage guidance for writers and the AI</span>
            <input id="g-note" type="text" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </label>
          <button className="btn" disabled={!draft.term_en.trim() && !draft.term_ka.trim()}>Add term</button>
        </form>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="panel table-wrap">
        <table className="list">
          <thead><tr><th>English</th><th>ქართული</th><th>Note</th><th /></tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id}>
                <td>{g.term_en}</td>
                <td lang="ka">{g.term_ka}</td>
                <td className="small muted">{g.note}</td>
                <td>{can("author") && <button className="linkbtn" onClick={() => remove(g.id)}>Remove</button>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="muted">No terms yet. Add the terminology your organisation has standardised, especially English–Georgian pairs.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
