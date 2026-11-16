import { supabase } from "../lib/supabase";
import type { AuditEvent, Chapter, Lang, Provenance } from "../lib/types";
import type { Manuscript, ManuscriptChapter, RevisionRow } from "./model";

export function buildRevisionRows(chapters: ManuscriptChapter[], events: Pick<AuditEvent, "chapter_id" | "event" | "detail" | "created_at">[]): RevisionRow[] {
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const pendingReason = new Map<string, string>();
  const rows: RevisionRow[] = [];
  for (const e of events) {
    if (!e.chapter_id) continue;
    const c = byId.get(e.chapter_id);
    if (!c) continue;
    if (e.event === "chapter_reopen") {
      pendingReason.set(e.chapter_id, String(e.detail?.note ?? "Revised"));
    } else if (e.event === "chapter_approve") {
      const rev = Number(e.detail?.revision ?? 0);
      rows.push({
        revision: rev,
        date: e.created_at,
        chapterNumber: c.number,
        chapterTitle: c.title.en || c.title.ka,
        description: pendingReason.get(e.chapter_id) ?? (rev === 0 ? "Initial issue" : "Revised"),
      });
      pendingReason.delete(e.chapter_id);
    }
  }
  return rows;
}

async function fetchLogo(path: string | null): Promise<Manuscript["org"]["logo"]> {
  if (!path) return null;
  const { data } = await supabase.storage.from("org-assets").download(path);
  if (!data) return null;
  const mime = data.type === "image/jpeg" ? "image/jpeg" : data.type === "image/png" ? "image/png" : null;
  if (!mime) return null;
  return { bytes: new Uint8Array(await data.arrayBuffer()), mime };
}

export async function loadManuscript(bookId: string, langs: Lang[]): Promise<Manuscript> {
  const book = await supabase.from("books").select("*").eq("id", bookId).single();
  if (book.error) throw book.error;
  const [org, chapters, prov, links, events] = await Promise.all([
    supabase.from("organizations").select("name, brand_color, logo_path").eq("id", book.data.org_id).single(),
    supabase.from("chapters").select("*").eq("book_id", bookId).order("position"),
    supabase.from("chapter_provenance").select("*").eq("book_id", bookId),
    supabase.from("chapter_sources").select("chapter_id, sources(title, reference, url)").eq("org_id", book.data.org_id),
    supabase.from("audit_events").select("chapter_id, event, detail, created_at").eq("book_id", bookId)
      .in("event", ["chapter_approve", "chapter_reopen"]).order("created_at"),
  ]);
  for (const r of [org, chapters, prov, links, events]) if (r.error) throw r.error;

  const provBy = new Map<string, Provenance>();
  for (const p of (prov.data ?? []) as Provenance[]) provBy.set(`${p.chapter_id}:${p.lang}`, p);
  const sourcesBy = new Map<string, { title: string; reference: string; url: string }[]>();
  for (const l of (links.data ?? []) as unknown as { chapter_id: string; sources: { title: string; reference: string; url: string } | null }[]) {
    if (!l.sources) continue;
    sourcesBy.set(l.chapter_id, [...(sourcesBy.get(l.chapter_id) ?? []), l.sources]);
  }

  const mChapters: ManuscriptChapter[] = ((chapters.data ?? []) as Chapter[]).map((c, i) => {
    const en = provBy.get(`${c.id}:en`);
    const ka = provBy.get(`${c.id}:ka`);
    return {
      number: i + 1,
      id: c.id,
      title: { en: c.title_en, ka: c.title_ka },
      goal: c.goal,
      status: c.status,
      revision: c.revision,
      approvedAt: c.approved_at,
      text: { en: en?.body ?? "", ka: ka?.body ?? "" },
      aiGenerated: { en: !!en?.ai_generated, ka: !!ka?.ai_generated },
      sources: sourcesBy.get(c.id) ?? [],
    };
  });

  return {
    org: { name: org.data!.name, brandColor: org.data!.brand_color, logo: await fetchLogo(org.data!.logo_path) },
    book: { id: book.data.id, title: book.data.title, subtitle: book.data.subtitle, documentRef: book.data.document_ref },
    langs,
    chapters: mChapters,
    revisions: buildRevisionRows(mChapters, (events.data ?? []) as AuditEvent[]),
    generatedAt: new Date().toISOString(),
  };
}
