// Prompt construction. Pure module (no Deno APIs) so it can be unit-tested.

export type Lang = "en" | "ka";
export const LANG_NAME: Record<Lang, string> = { en: "English", ka: "Georgian (ქართული)" };

export interface SourceDoc {
  title: string;
  reference: string;
  kind: string;
  excerpt: string;
}
export interface GlossaryTerm {
  term_en: string;
  term_ka: string;
  note: string;
}
export interface BookContext {
  orgName: string;
  bookTitle: string;
  domainHint?: string;
  chapterTitles: string[];
}

const MAX_SOURCE_CHARS = 60_000;
const MAX_EXCERPT_CHARS = 12_000;

export const TEXT_FORMAT_RULES = `Output format (the export engine depends on it):
- Plain paragraphs separated by one blank line.
- Optional subheadings on their own line, starting with "## ".
- Bulleted lists: lines starting with "- ". Numbered lists: lines starting with "1. ", "2. " and so on.
- No other markdown: no bold, italics, tables, links or code blocks. No chapter title at the top.
- No preamble or closing remarks addressed to the user.`;

export function systemPrompt(ctx: BookContext): string {
  return `You are a senior technical writer for regulated training documentation in aviation and occupational safety and health (OSH). You write for ${ctx.orgName}.

Ground rules:
- Accuracy over fluency. Never invent regulation numbers, paragraph references, limits, figures or dates.
- Where the text needs a regulatory or factual claim that the provided sources do not support, write the claim cautiously and insert the marker [CITATION NEEDED: what must be verified] right after it.
- When you rely on a provided source, name it in the sentence (for example "ICAO Annex 19 requires…"). Do not cite sources that were not provided.
- Use the organisation's glossary terms exactly as given.
- Write for trainees and instructors: clear, direct, professional, practical. Prefer concrete procedures and examples over generalities.
- The approving organisation remains responsible for the content; your text is a draft for expert review.`;
}

export function sourcesBlock(sources: SourceDoc[]): string {
  if (!sources.length) {
    return "No sources are linked to this chapter. Treat every specific regulatory claim as needing a citation.";
  }
  let used = 0;
  const parts: string[] = [];
  for (const [i, s] of sources.entries()) {
    let excerpt = (s.excerpt || "").trim();
    if (excerpt.length > MAX_EXCERPT_CHARS) excerpt = excerpt.slice(0, MAX_EXCERPT_CHARS) + "\n[excerpt truncated]";
    if (used + excerpt.length > MAX_SOURCE_CHARS) excerpt = "[excerpt omitted: source library limit reached]";
    used += excerpt.length;
    parts.push(
      `<source index="${i + 1}" kind="${escapeAttr(s.kind)}">\nTitle: ${s.title}\nReference: ${s.reference || "not given"}\n${
        excerpt ? `Excerpt:\n${excerpt}` : "No excerpt provided: you may name this source, but do not quote or paraphrase specific requirements from it."
      }\n</source>`,
    );
  }
  return `Sources linked to this chapter (the only sources you may rely on):\n${parts.join("\n")}`;
}

export function glossaryBlock(terms: GlossaryTerm[]): string {
  const rows = terms
    .filter((t) => t.term_en.trim() || t.term_ka.trim())
    .slice(0, 300)
    .map((t) => `- ${t.term_en || "—"} = ${t.term_ka || "—"}${t.note ? ` (${t.note})` : ""}`);
  return rows.length ? `Organisation glossary (English = Georgian):\n${rows.join("\n")}` : "";
}

function escapeAttr(s: string): string {
  return s.replace(/[<>"&]/g, "");
}

function georgianStyle(lang: Lang): string {
  return lang === "ka"
    ? `Write in standard literary Georgian in a formal technical register, as a Georgian aviation or OSH professional would. Avoid calques from English and Russian. Keep internationally used abbreviations (ICAO, EASA, SMS, CRM, TEM, PPE) in Latin script, with the Georgian term at first use where one is established.`
    : `Write in clear international English (British spelling), suitable for non-native readers.`;
}

export function draftPrompt(args: {
  ctx: BookContext;
  lang: Lang;
  chapterTitle: string;
  goal: string;
  existingText: string;
  sources: SourceDoc[];
  glossary: GlossaryTerm[];
}): string {
  const outline = args.ctx.chapterTitles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  return [
    `Book: ${args.ctx.bookTitle}`,
    `Full chapter list, for context and to avoid overlap:\n${outline}`,
    `Write the chapter "${args.chapterTitle}" in ${LANG_NAME[args.lang]}.`,
    `Chapter goal: ${args.goal || "not stated; infer it from the title and the book."}`,
    args.existingText.trim()
      ? `The author has already written the notes or partial text below. Build on it: keep its facts and intent, expand it into a complete chapter, and do not drop anything the author wrote.\n<author_text>\n${args.existingText}\n</author_text>`
      : "",
    sourcesBlock(args.sources),
    glossaryBlock(args.glossary),
    georgianStyle(args.lang),
    "Length: typically 900 to 1,800 words, more only if the goal genuinely needs it.",
    TEXT_FORMAT_RULES,
  ].filter(Boolean).join("\n\n");
}

export function adaptPrompt(args: {
  ctx: BookContext;
  from: Lang;
  to: Lang;
  chapterTitle: string;
  sourceText: string;
  glossary: GlossaryTerm[];
}): string {
  return [
    `Book: ${args.ctx.bookTitle}`,
    `Adapt the chapter "${args.chapterTitle}" from ${LANG_NAME[args.from]} into ${LANG_NAME[args.to]}.`,
    `This is an adaptation for professional readers, not a word-for-word translation: preserve every fact, requirement, number, reference and [CITATION NEEDED] marker exactly, keep the structure (headings, lists, paragraph order), and make the language read as if written natively.`,
    glossaryBlock(args.glossary),
    georgianStyle(args.to),
    `<source_text lang="${args.from}">\n${args.sourceText}\n</source_text>`,
    TEXT_FORMAT_RULES,
  ].filter(Boolean).join("\n\n");
}

export const FLAG_TYPES = [
  "Needs citation",
  "Contradicts source",
  "Terminology",
  "Inconsistent with other language",
  "Repetition",
  "Clarity",
  "Tone",
] as const;

export const CHECK_SCHEMA = {
  type: "object",
  properties: {
    flags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...FLAG_TYPES] },
          note: { type: "string" },
        },
        required: ["type", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["flags"],
  additionalProperties: false,
} as const;

export function checkPrompt(args: {
  ctx: BookContext;
  lang: Lang;
  chapterTitle: string;
  text: string;
  otherLangText: string;
  sources: SourceDoc[];
  glossary: GlossaryTerm[];
}): string {
  const other: Lang = args.lang === "en" ? "ka" : "en";
  return [
    `Review the chapter "${args.chapterTitle}" (in ${LANG_NAME[args.lang]}) of "${args.ctx.bookTitle}" as a strict technical editor before it goes to the approver.`,
    `Report up to 10 concrete issues, most important first. Look for: regulatory or factual claims that need a citation or are not supported by the sources; statements that contradict a provided source; glossary terms used inconsistently; ${
      args.otherLangText.trim() ? `facts, numbers or requirements that differ from the ${LANG_NAME[other]} version; ` : ""
    }repetition; unclear instructions; tone that is wrong for a training manual.`,
    `Each note must be one or two sentences, specific enough to act on, and written in ${LANG_NAME[args.lang]}. Quote the problem phrase briefly. If the chapter has no real issues, return an empty list.`,
    sourcesBlock(args.sources),
    glossaryBlock(args.glossary),
    `<chapter lang="${args.lang}">\n${args.text}\n</chapter>`,
    args.otherLangText.trim() ? `<other_language_version lang="${other}">\n${args.otherLangText}\n</other_language_version>` : "",
  ].filter(Boolean).join("\n\n");
}

export const BLUEPRINT_SCHEMA = {
  type: "object",
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title_en: { type: "string" },
          title_ka: { type: "string" },
          goal: { type: "string" },
        },
        required: ["title_en", "title_ka", "goal"],
        additionalProperties: false,
      },
    },
  },
  required: ["chapters"],
  additionalProperties: false,
} as const;

export function blueprintPrompt(args: { ctx: BookContext; notes: string; goalLang: Lang }): string {
  return [
    `Book: ${args.ctx.bookTitle}`,
    args.ctx.chapterTitles.length
      ? `The book already has these chapters; propose only additional chapters that fill gaps:\n${args.ctx.chapterTitles.map((t) => `- ${t}`).join("\n")}`
      : "",
    `Below are the author's raw notes. Cluster them into a coherent chapter structure for a training manual or course book (between 3 and 12 chapters). Do not write chapter prose.`,
    `For each chapter give an English title, a Georgian title, and a one-sentence goal in ${LANG_NAME[args.goalLang]} saying what the chapter must achieve for the reader. Keep the author's order where it makes sense.`,
    `<notes>\n${args.notes}\n</notes>`,
  ].filter(Boolean).join("\n\n");
}

export interface Flag {
  type: string;
  note: string;
}

/** Parse a structured-output reply defensively. */
export function parseFlags(text: string): Flag[] {
  const data = parseJsonObject(text) as { flags?: unknown };
  if (!Array.isArray(data?.flags)) return [];
  return data.flags
    .filter((f): f is Flag => !!f && typeof (f as Flag).note === "string" && (f as Flag).note.trim().length > 0)
    .slice(0, 10)
    .map((f) => ({ type: String(f.type || "Clarity").slice(0, 60), note: f.note.trim().slice(0, 1000) }));
}

export interface BlueprintChapter {
  title_en: string;
  title_ka: string;
  goal: string;
}

export function parseBlueprint(text: string): BlueprintChapter[] {
  const data = parseJsonObject(text) as { chapters?: unknown };
  if (!Array.isArray(data?.chapters)) return [];
  return data.chapters
    .map((c) => c as Partial<BlueprintChapter>)
    .filter((c) => typeof c.title_en === "string" || typeof c.title_ka === "string")
    .slice(0, 12)
    .map((c) => ({
      title_en: String(c.title_en ?? "").trim().slice(0, 200),
      title_ka: String(c.title_ka ?? "").trim().slice(0, 200),
      goal: String(c.goal ?? "").trim().slice(0, 600),
    }));
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
