import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { parseBlocks } from "../lib/text";
import type { Lang } from "../lib/types";
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
import { fmtDate } from "../lib/format";

const hex = (c: string) => c.replace("#", "").toUpperCase();

function cell(text: string, opts: { bold?: boolean; fill?: string; color?: string; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { type: ShadingType.CLEAR, color: "auto", fill: opts.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: 19 })] })],
  });
}

function table(headers: string[], rows: string[][], brand: string, widths: number[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { bold: true, fill: hex(brand), color: "FFFFFF", width: widths[i] })),
      }),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, { width: widths[i] })) })),
    ],
  });
}

export async function buildDocx(m: Manuscript): Promise<Document> {
  const brand = m.org.brandColor;
  let listInstance = 0;
  const body: (Paragraph | Table | TableOfContents)[] = [];

  // Cover
  if (m.org.logo) {
    body.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 600 },
        children: [
          new ImageRun({
            type: m.org.logo.mime === "image/png" ? "png" : "jpg",
            data: m.org.logo.bytes,
            transformation: { width: 160, height: 80 },
          }),
        ],
      }),
    );
  }
  body.push(
    new Paragraph({ spacing: { before: 1800 }, children: [new TextRun({ text: m.org.name.toUpperCase(), size: 20, color: hex(brand), bold: true })] }),
    new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: m.book.title, size: 56, bold: true })] }),
  );
  if (m.book.subtitle) body.push(new Paragraph({ children: [new TextRun({ text: m.book.subtitle, size: 30, color: "555555" })] }));
  body.push(
    new Paragraph({
      spacing: { before: 600 },
      children: [
        new TextRun({ text: [m.book.documentRef, documentRevision(m), fmtDate(m.generatedAt)].filter(Boolean).join("  ·  "), size: 20 }),
      ],
    }),
    new Paragraph({ children: [new TextRun({ text: `Languages: ${m.langs.map(langHeading).join(", ")}`, size: 20, color: "555555" })] }),
  );
  if (isDraft(m)) {
    body.push(
      new Paragraph({
        spacing: { before: 400 },
        children: [new TextRun({ text: "UNCONTROLLED DRAFT — contains chapters that are not yet approved.", bold: true, color: "B03A2E", size: 20 })],
      }),
    );
  }
  body.push(new Paragraph({ children: [new PageBreak()] }));

  // Record of revisions + list of effective chapters
  body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Record of Revisions")] }));
  body.push(
    m.revisions.length
      ? table(
        ["Rev", "Date", "Chapter", "Description"],
        m.revisions.map((r) => [String(r.revision), fmtDate(r.date), `${r.chapterNumber}. ${r.chapterTitle}`, r.description]),
        brand,
        [8, 16, 36, 40],
      )
      : new Paragraph({ children: [new TextRun({ text: "No chapter has been approved yet.", italics: true })] }),
  );
  body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 400 }, children: [new TextRun("List of Effective Chapters")] }));
  body.push(
    table(
      ["No.", "Chapter", "Revision", "Approved"],
      m.chapters.map((c) => [String(c.number), chapterTitleFor(c, m.langs[0]), statusLine(c), fmtDate(c.approvedAt)]),
      brand,
      [8, 52, 18, 22],
    ),
  );
  body.push(new Paragraph({ children: [new PageBreak()] }));

  // Contents (Word fills it in when the document is opened and fields are updated)
  body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Contents")] }));
  body.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));
  body.push(new Paragraph({ children: [new PageBreak()] }));

  // Chapters
  m.chapters.forEach((c, idx) => {
    if (idx > 0) body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun(`${c.number}. ${chapterTitleFor(c, m.langs[0])}`)],
      }),
    );
    if (m.langs.length > 1 && c.title[m.langs[1]]) {
      body.push(new Paragraph({ children: [new TextRun({ text: chapterTitleFor(c, m.langs[1]), color: "555555", size: 24 })] }));
    }
    const meta = m.includeAuthorship
      ? `${statusLine(c)} · ${m.langs.map((l) => `${l.toUpperCase()}: ${provenanceLabel(c, l)}`).join(" · ")}`
      : statusLine(c);
    body.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: meta, size: 16, color: "777777" })] }));
    for (const lang of m.langs) {
      if (m.langs.length > 1) {
        body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(langHeading(lang))] }));
      }
      const text = c.text[lang];
      if (!text?.trim()) {
        body.push(new Paragraph({ children: [new TextRun({ text: "Not written in this language yet.", italics: true, color: "777777" })] }));
        continue;
      }
      for (const b of parseBlocks(text)) {
        if (b.type === "h") body.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(b.text)] }));
        else if (b.type === "p") body.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun(b.text)] }));
        else if (b.type === "ul") b.items.forEach((t) => body.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(t)] })));
        else {
          listInstance += 1;
          b.items.forEach((t) =>
            body.push(new Paragraph({ numbering: { reference: "manual-numbered", level: 0, instance: listInstance }, children: [new TextRun(t)] }))
          );
        }
      }
    }
    if (c.sources.length) {
      body.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: "Sources", bold: true })] }));
      c.sources.forEach((s) =>
        body.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(`${s.title}${s.reference ? ` — ${s.reference}` : ""}${s.url ? ` (${s.url})` : ""}`)] }))
      );
    }
  });

  // Provenance appendix (optional)
  if (m.includeAuthorship) {
    body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Appendix — Authorship and AI Provenance")] }));
    body.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: DISCLOSURE_NOTE, size: 19 })] }));
    body.push(
      table(
        ["No.", "Chapter", ...m.langs.map((l: Lang) => langHeading(l))],
        m.chapters.map((c) => [String(c.number), chapterTitleFor(c, m.langs[0]), ...m.langs.map((l) => provenanceLabel(c, l))]),
        brand,
        m.langs.length > 1 ? [8, 40, 26, 26] : [8, 56, 36],
      ),
    );
  }

  const headerText = [m.book.title, m.book.documentRef].filter(Boolean).join(" · ");
  return new Document({
    creator: m.org.name,
    title: m.book.title,
    description: "Exported from Book Studio",
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { size: 34, bold: true, color: hex(brand) }, paragraph: { spacing: { before: 240, after: 160 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { size: 26, bold: true, color: hex(brand) }, paragraph: { spacing: { before: 240, after: 120 } } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", run: { size: 23, bold: true }, paragraph: { spacing: { before: 200, after: 80 } } },
      ],
    },
    numbering: {
      config: [{
        reference: "manual-numbered",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      }],
    },
    sections: [{
      headers: {
        default: new Header({
          children: [new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 4 } },
            children: [new TextRun({ text: headerText, size: 16, color: "777777" })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `${documentRevision(m)} · ${fmtDate(m.generatedAt)} · Page `, size: 16, color: "777777" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "777777" }),
              new TextRun({ text: " of ", size: 16, color: "777777" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "777777" }),
            ],
          })],
        }),
      },
      children: body,
    }],
  });
}
