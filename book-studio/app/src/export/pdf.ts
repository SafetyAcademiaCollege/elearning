// Branded PDF, built as a pdfmake document definition (pure, testable) and
// rendered with fonts that cover Latin and Georgian.
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { fmtDate } from "../lib/format";
import { parseBlocks, scriptRuns } from "../lib/text";
import {
  chapterTitleFor,
  DISCLOSURE_NOTE,
  documentRevision,
  isDraft,
  langHeading,
  type Manuscript,
  provenanceLabel,
  statusLine,
} from "./model";

export const PDF_FONTS = {
  NotoSans: {
    normal: "NotoSans-Regular.ttf",
    bold: "NotoSans-Bold.ttf",
    italics: "NotoSans-Italic.ttf",
    bolditalics: "NotoSans-BoldItalic.ttf",
  },
  NotoGeorgian: {
    normal: "NotoSansGeorgian-Regular.ttf",
    bold: "NotoSansGeorgian-Bold.ttf",
    italics: "NotoSansGeorgian-Regular.ttf",
    bolditalics: "NotoSansGeorgian-Bold.ttf",
  },
};

/** Text with per-script font switching, so Georgian always renders. */
export function t(text: string, extra: Record<string, unknown> = {}): Content {
  const runs = scriptRuns(text);
  if (runs.length === 1 && !runs[0].georgian) return { text, ...extra } as Content;
  return { text: runs.map((r) => (r.georgian ? { text: r.text, font: "NotoGeorgian" } : { text: r.text })), ...extra } as Content;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function simpleTable(headers: string[], rows: string[][], widths: (string | number)[], brand: string): Content {
  return {
    table: {
      headerRows: 1,
      widths,
      body: [
        headers.map((h) => t(h, { bold: true, color: "#FFFFFF", fillColor: brand, fontSize: 8.5 })),
        ...rows.map((r) => r.map((c) => t(c, { fontSize: 8.5 }))),
      ],
    },
    layout: {
      hLineColor: () => "#CCCCCC",
      vLineColor: () => "#CCCCCC",
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 4, 0, 16],
  } as Content;
}

export function buildPdfDefinition(m: Manuscript): TDocumentDefinitions {
  const brand = m.org.brandColor;
  const lead = m.langs[0];
  const content: Content[] = [];

  // Cover
  if (m.org.logo) {
    content.push({ image: `data:${m.org.logo.mime};base64,${bytesToBase64(m.org.logo.bytes)}`, fit: [150, 70], margin: [0, 0, 0, 40] } as Content);
  } else {
    content.push({ text: "", margin: [0, 110, 0, 0] });
  }
  content.push(
    { canvas: [{ type: "rect", x: 0, y: 0, w: 60, h: 5, color: brand }], margin: [0, 80, 0, 18] } as Content,
    t(m.org.name.toUpperCase(), { fontSize: 10, bold: true, color: brand, characterSpacing: 1 }),
    t(m.book.title, { fontSize: 30, bold: true, margin: [0, 10, 0, 6], lineHeight: 1.1 }),
  );
  if (m.book.subtitle) content.push(t(m.book.subtitle, { fontSize: 15, color: "#555555" }));
  content.push(
    t([m.book.documentRef, documentRevision(m), fmtDate(m.generatedAt)].filter(Boolean).join("   ·   "), { fontSize: 10, margin: [0, 40, 0, 4] }),
    t(`Languages: ${m.langs.map(langHeading).join(", ")}`, { fontSize: 10, color: "#555555" }),
  );
  if (isDraft(m)) {
    content.push(t("UNCONTROLLED DRAFT — contains chapters that are not yet approved.", { bold: true, color: "#B03A2E", fontSize: 10, margin: [0, 24, 0, 0] }));
  }

  // Record of revisions + effective chapters
  content.push(t("Record of Revisions", { style: "h1", pageBreak: "before" }));
  content.push(
    m.revisions.length
      ? simpleTable(
        ["Rev", "Date", "Chapter", "Description"],
        m.revisions.map((r) => [String(r.revision), fmtDate(r.date), `${r.chapterNumber}. ${r.chapterTitle}`, r.description]),
        [28, 62, "*", "*"],
        brand,
      )
      : t("No chapter has been approved yet.", { italics: true, margin: [0, 0, 0, 16] }),
  );
  content.push(t("List of Effective Chapters", { style: "h1" }));
  content.push(
    simpleTable(
      ["No.", "Chapter", "Revision", "Approved"],
      m.chapters.map((c) => [String(c.number), chapterTitleFor(c, lead), statusLine(c), fmtDate(c.approvedAt)]),
      [28, "*", 60, 70],
      brand,
    ),
  );

  // Contents
  content.push({
    toc: { title: t("Contents", { style: "h1" }), numberStyle: { fontSize: 10 } },
    pageBreak: "before",
  } as Content);

  // Chapters
  for (const c of m.chapters) {
    content.push(t(`${c.number}. ${chapterTitleFor(c, lead)}`, { style: "h1", pageBreak: "before", tocItem: true, tocStyle: { fontSize: 10 } }));
    if (m.langs.length > 1 && c.title[m.langs[1]]) content.push(t(chapterTitleFor(c, m.langs[1]), { fontSize: 12, color: "#555555", margin: [0, -4, 0, 4] }));
    content.push(
      t(`${statusLine(c)}  ·  ${m.langs.map((l) => `${l.toUpperCase()}: ${provenanceLabel(c, l)}`).join("  ·  ")}`, {
        fontSize: 7.5,
        color: "#777777",
        margin: [0, 0, 0, 12],
      }),
    );
    for (const lang of m.langs) {
      if (m.langs.length > 1) content.push(t(langHeading(lang), { style: "h2" }));
      const text = c.text[lang];
      if (!text?.trim()) {
        content.push(t("Not written in this language yet.", { italics: true, color: "#777777", margin: [0, 0, 0, 8] }));
        continue;
      }
      for (const b of parseBlocks(text)) {
        if (b.type === "h") content.push(t(b.text, { style: "h3" }));
        else if (b.type === "p") content.push(t(b.text, { style: "body" }));
        else if (b.type === "ul") content.push({ ul: b.items.map((i) => t(i)), style: "body" } as Content);
        else content.push({ ol: b.items.map((i) => t(i)), style: "body" } as Content);
      }
    }
    if (c.sources.length) {
      content.push(t("Sources", { bold: true, fontSize: 9.5, margin: [0, 10, 0, 4] }));
      content.push({
        ul: c.sources.map((s) => t(`${s.title}${s.reference ? ` — ${s.reference}` : ""}${s.url ? ` (${s.url})` : ""}`, { fontSize: 9 })),
      } as Content);
    }
  }

  // Provenance appendix
  content.push(t("Appendix — Authorship and AI Provenance", { style: "h1", pageBreak: "before", tocItem: true, tocStyle: { fontSize: 10 } }));
  content.push(t(DISCLOSURE_NOTE, { fontSize: 9, margin: [0, 0, 0, 10] }));
  content.push(
    simpleTable(
      ["No.", "Chapter", ...m.langs.map(langHeading)],
      m.chapters.map((c) => [String(c.number), chapterTitleFor(c, lead), ...m.langs.map((l) => provenanceLabel(c, l))]),
      m.langs.length > 1 ? [28, "*", 110, 110] : [28, "*", 140],
      brand,
    ),
  );

  const headerText = [m.book.title, m.book.documentRef].filter(Boolean).join("  ·  ");
  return {
    pageSize: "A4",
    pageMargins: [56, 64, 56, 60],
    info: { title: m.book.title, author: m.org.name, creator: "Book Studio" },
    defaultStyle: { font: "NotoSans", fontSize: 10.5, lineHeight: 1.3 },
    styles: {
      h1: { fontSize: 18, bold: true, color: brand, margin: [0, 0, 0, 10] },
      h2: { fontSize: 13, bold: true, color: brand, margin: [0, 12, 0, 6] },
      h3: { fontSize: 11.5, bold: true, margin: [0, 10, 0, 4] },
      body: { margin: [0, 0, 0, 8] },
    },
    header: (page: number) =>
      page === 1 ? null : ({ ...(t(headerText, { fontSize: 7.5, color: "#777777" }) as object), margin: [56, 30, 56, 0] } as Content),
    footer: (page: number, pages: number) =>
      page === 1 ? null : ({
        ...(t(`${documentRevision(m)}  ·  ${fmtDate(m.generatedAt)}  ·  Page ${page} of ${pages}`, { fontSize: 7.5, color: "#777777", alignment: "right" }) as object),
        margin: [56, 20, 56, 0],
      } as Content),
    content,
  };
}
