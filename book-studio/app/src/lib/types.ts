export type Lang = "en" | "ka";
export const LANGS: Lang[] = ["en", "ka"];
export const LANG_LABEL: Record<Lang, string> = { en: "English", ka: "ქართული" };
export const LANG_SHORT: Record<Lang, string> = { en: "EN", ka: "KA" };

export type Role = "owner" | "author" | "reviewer" | "approver";
export const ROLES: Role[] = ["owner", "author", "reviewer", "approver"];

export type ChapterStatus = "draft" | "in_review" | "reviewed" | "changes_requested" | "approved";
export const STATUS_LABEL: Record<ChapterStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  reviewed: "Reviewed",
  changes_requested: "Changes requested",
  approved: "Approved",
};

export interface Plan {
  id: string;
  name: string;
  seats: number;
  max_books: number | null;
  ai_monthly_budget_usd: number;
  exports: string[];
}

export interface Organization {
  id: string;
  name: string;
  brand_color: string;
  logo_path: string | null;
  plan_id: string;
  subscription_status: string;
  stripe_subscription_id: string | null;
}

export interface Membership {
  org_id: string;
  user_id: string;
  roles: Role[];
  created_at: string;
  profiles?: { email: string | null; full_name: string | null } | null;
}

export interface Template {
  id: string;
  name: string;
  name_ka: string | null;
  description: string;
  domain: string;
  chapters: { title_en: string; title_ka: string; goal: string }[];
  sort: number;
}

export interface Book {
  id: string;
  org_id: string;
  title: string;
  subtitle: string;
  document_ref: string;
  template_id: string | null;
  languages: Lang[];
  primary_lang: Lang;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  org_id: string;
  book_id: string;
  position: number;
  title_en: string;
  title_ka: string;
  goal: string;
  status: ChapterStatus;
  revision: number | null;
  approved_at: string | null;
  approved_by: string | null;
  updated_at: string;
}

export interface Provenance {
  chapter_id: string;
  book_id: string;
  lang: Lang;
  ai_generated: boolean;
  body: string | null;
  version_id: number | null;
  last_edit_at: string | null;
}

export interface Version {
  id: number;
  chapter_id: string;
  lang: Lang;
  body: string;
  source: "author" | "ai";
  ai_op: "draft" | "adapt" | null;
  model: string | null;
  restored_from: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  org_id: string;
  title: string;
  reference: string;
  kind: "regulation" | "standard" | "guidance" | "internal" | "other";
  url: string;
  excerpt: string;
  created_at: string;
}

export interface GlossaryTerm {
  id: string;
  org_id: string;
  term_en: string;
  term_ka: string;
  note: string;
}

export interface Comment {
  id: string;
  chapter_id: string;
  lang: Lang | null;
  author_id: string;
  body: string;
  kind: "comment" | "review" | "system";
  resolved: boolean;
  created_at: string;
}

export interface Flag {
  id: number;
  chapter_id: string;
  lang: Lang;
  type: string;
  note: string;
  kind: "check" | "suggest";
  created_at: string;
}

export interface AuditEvent {
  id: number;
  book_id: string | null;
  chapter_id: string | null;
  actor_id: string | null;
  event: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export function chapterTitle(c: Pick<Chapter, "title_en" | "title_ka">, lang: Lang): string {
  return (lang === "ka" ? c.title_ka || c.title_en : c.title_en || c.title_ka) || "Untitled chapter";
}
