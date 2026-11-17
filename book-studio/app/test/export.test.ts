import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { XMLValidator } from "fast-xml-parser";
import { createRequire } from "node:module";
import { Packer } from "docx";
import { buildDocx } from "../src/export/docx";
import { buildPdfDefinition, PDF_FONTS } from "../src/export/pdf";
import { buildEpub } from "../src/export/epub";
import { buildScorm } from "../src/export/scorm";
import { buildRevisionRows } from "../src/export/load";
import { documentRevision, isDraft } from "../src/export/model";
import { sampleManuscript } from "./fixture";

const require = createRequire(import.meta.url);

describe("model", () => {
  it("knows when a book is still a draft", () => {
    const m = sampleManuscript();
    expect(isDraft(m)).toBe(true);
    expect(documentRevision(m)).toMatch(/Draft/);
    m.chapters[1].status = "approved";
    m.chapters[1].revision = 2;
    expect(documentRevision(m)).toBe("Revision 2");
  });

  it("builds the record of revisions from approval events", () => {
    const m = sampleManuscript();
    const rows = buildRevisionRows(m.chapters, [
      { chapter_id: "c1", event: "chapter_approve", detail: { revision: 0 }, created_at: "2026-01-01" },
      { chapter_id: "c1", event: "chapter_reopen", detail: { note: "Annual review" }, created_at: "2026-06-01" },
      { chapter_id: "c1", event: "chapter_approve", detail: { revision: 1 }, created_at: "2026-06-02" },
      { chapter_id: "gone", event: "chapter_approve", detail: { revision: 0 }, created_at: "2026-06-02" },
    ]);
    expect(rows.map((r) => [r.revision, r.description])).toEqual([[0, "Initial issue"], [1, "Annual review"]]);
  });
});

describe("DOCX", () => {
  it("is clean by default: no AI labels or provenance appendix", async () => {
    const buf = await Packer.toBuffer(await buildDocx(sampleManuscript()));
    const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
    expect(xml).toContain("ეს სახელმძღვანელო აღწერს");
    expect(xml).not.toMatch(/AI-generated|Provenance|Written by the author/);
  });

  it("produces a Word file with both languages, lists and, on request, the provenance appendix", async () => {
    const buf = await Packer.toBuffer(await buildDocx(sampleManuscript({ includeAuthorship: true })));
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("ATO Training Manual");
    expect(xml).toContain("ეს სახელმძღვანელო აღწერს");
    expect(xml).toContain("Record of Revisions");
    expect(xml).toContain("AI-generated, human-reviewed");
    expect(xml).toContain("Approve &amp; issue &lt;now&gt;");
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(await zip.file("word/numbering.xml")!.async("string")).toContain("w:abstractNum");
  });
});

describe("PDF", () => {
  it("renders with embedded Latin and Georgian fonts", async () => {
    const pdfmake = require("pdfmake");
    const dir = require.resolve("@expo-google-fonts/noto-sans/package.json").replace("package.json", "");
    const geo = require.resolve("@expo-google-fonts/noto-sans-georgian/package.json").replace("package.json", "");
    const paths: Record<string, string> = {
      "NotoSans-Regular.ttf": dir + "400Regular/NotoSans_400Regular.ttf",
      "NotoSans-Bold.ttf": dir + "700Bold/NotoSans_700Bold.ttf",
      "NotoSans-Italic.ttf": dir + "400Regular_Italic/NotoSans_400Regular_Italic.ttf",
      "NotoSans-BoldItalic.ttf": dir + "700Bold_Italic/NotoSans_700Bold_Italic.ttf",
      "NotoSansGeorgian-Regular.ttf": geo + "400Regular/NotoSansGeorgian_400Regular.ttf",
      "NotoSansGeorgian-Bold.ttf": geo + "700Bold/NotoSansGeorgian_700Bold.ttf",
    };
    const fonts = Object.fromEntries(
      Object.entries(PDF_FONTS).map(([fam, v]) => [fam, Object.fromEntries(Object.entries(v).map(([k, f]) => [k, paths[f]]))]),
    );
    pdfmake.setFonts(fonts);
    pdfmake.setUrlAccessPolicy(() => false);
    pdfmake.setLocalAccessPolicy(() => true);
    const clean = JSON.stringify(buildPdfDefinition(sampleManuscript()).content);
    expect(clean).not.toMatch(/AI-generated|Provenance/);
    expect(JSON.stringify(buildPdfDefinition(sampleManuscript({ includeAuthorship: true })).content)).toContain("AI-generated, human-reviewed");
    const buf: Buffer = await pdfmake.createPdf(buildPdfDefinition(sampleManuscript())).getBuffer();
    const head = buf.subarray(0, 5).toString("latin1");
    expect(head).toBe("%PDF-");
    const raw = buf.toString("latin1");
    expect(raw).toContain("NotoSansGeorgian");
    expect(raw).toContain("NotoSans-");
    expect(buf.length).toBeGreaterThan(20_000);
  }, 30_000);
});

describe("EPUB", () => {
  it("leaves out the provenance page unless asked", async () => {
    const clean = await buildEpub(sampleManuscript());
    expect(clean.file("OEBPS/provenance.xhtml")).toBeNull();
    expect(await clean.file("OEBPS/content.opf")!.async("string")).not.toContain("provenance");
    const full = await buildEpub(sampleManuscript({ includeAuthorship: true }));
    expect(full.file("OEBPS/provenance.xhtml")).toBeTruthy();
  });

  it("is a valid EPUB container with well-formed XHTML", async () => {
    const zip = await buildEpub(sampleManuscript({ includeAuthorship: true }));
    const bytes = await zip.generateAsync({ type: "uint8array" });
    // mimetype must be the first entry, stored uncompressed
    expect(new TextDecoder().decode(bytes.subarray(30, 38))).toBe("mimetype");
    expect(bytes[8]).toBe(0); // compression method low byte: 0 = stored
    const files = Object.keys(zip.files);
    expect(files).toEqual(expect.arrayContaining(["META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml", "OEBPS/chapter-1.xhtml", "OEBPS/chapter-2.xhtml", "OEBPS/toc.ncx"]));
    for (const f of files.filter((f) => /\.(xhtml|opf|ncx|xml)$/.test(f))) {
      const xml = await zip.file(f)!.async("string");
      expect(XMLValidator.validate(xml), f).toBe(true);
    }
    const ch = await zip.file("OEBPS/chapter-1.xhtml")!.async("string");
    expect(ch).toContain('lang="ka"');
    expect(ch).toContain("&lt;now&gt;");
  });
});

describe("SCORM", () => {
  it("has a valid 1.2 manifest with one SCO per chapter", async () => {
    const zip = await buildScorm(sampleManuscript());
    const manifest = await zip.file("imsmanifest.xml")!.async("string");
    expect(XMLValidator.validate(manifest)).toBe(true);
    expect(manifest).toContain("<schemaversion>1.2</schemaversion>");
    expect((manifest.match(/adlcp:scormtype="sco"/g) ?? []).length).toBe(2);
    expect(zip.file("chapter-2.html")).toBeTruthy();
    const page = await zip.file("chapter-1.html")!.async("string");
    expect(page).toContain('src="shared/scorm.js"');
    expect(page).toContain("ნაწილი A — ზოგადი");
    expect(await zip.file("shared/scorm.js")!.async("string")).toContain('api.LMSSetValue("cmi.core.lesson_status", "completed")');
  });
});
