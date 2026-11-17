// The manuscript model every exporter renders. Built from the database by load.ts.
import type { ChapterStatus, Lang } from "../lib/types";
import { LANG_LABEL } from "../lib/types";

export interface ManuscriptSource {
  title: string;
  reference: string;
  url: string;
}

export interface ManuscriptChapter {
  number: number;
  id: string;
  title: Record<Lang, string>;
  goal: string;
  status: ChapterStatus;
  revision: number | null;
  approvedAt: string | null;
  text: Record<Lang, string>;
  aiGenerated: Record<Lang, boolean>;
  sources: ManuscriptSource[];
}

export interface RevisionRow {
  revision: number;
  date: string;
  chapterNumber: number;
  chapterTitle: string;
  description: string;
}

export interface Manuscript {
  org: { name: string; brandColor: string; logo: { bytes: Uint8Array; mime: "image/png" | "image/jpeg" } | null };
  book: { id: string; title: string; subtitle: string; documentRef: string };
  langs: Lang[];
  chapters: ManuscriptChapter[];
  revisions: RevisionRow[];
  generatedAt: string;
  /** Include per-chapter authorship lines and the AI provenance appendix. Off by default. */
  includeAuthorship: boolean;
}

export type ExportFormat = "docx" | "pdf" | "epub" | "scorm";

export function isDraft(m: Manuscript): boolean {
  return m.chapters.some((c) => c.status !== "approved");
}

export function chapterTitleFor(c: ManuscriptChapter, lang: Lang): string {
  return c.title[lang] || c.title[lang === "en" ? "ka" : "en"] || `Chapter ${c.number}`;
}

export function provenanceLabel(c: ManuscriptChapter, lang: Lang): string {
  if (!c.text[lang]?.trim()) return "Not written";
  return c.aiGenerated[lang] ? "AI-generated, human-reviewed" : "Written by the author";
}

export function statusLine(c: ManuscriptChapter): string {
  if (c.status === "approved" && c.revision !== null) return `Rev ${c.revision}`;
  return "Draft";
}

/** Document-level revision: the highest approved chapter revision, or "Draft". */
export function documentRevision(m: Manuscript): string {
  if (isDraft(m)) return "Draft — not approved";
  const max = Math.max(...m.chapters.map((c) => c.revision ?? 0));
  return `Revision ${max}`;
}

export function langHeading(lang: Lang): string {
  return LANG_LABEL[lang];
}

export const DISCLOSURE_NOTE =
  "Provenance follows the publisher-disclosure convention used by e-book retailers: once AI has drafted or translated a chapter's text in a language, that version is recorded as AI-generated however much it was edited afterwards. Every chapter was reviewed and approved by the organisation's own staff.";
