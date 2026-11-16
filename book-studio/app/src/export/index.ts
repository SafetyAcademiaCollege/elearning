import { safeFilename } from "../lib/format";
import type { Lang } from "../lib/types";
import { loadManuscript } from "./load";
import type { ExportFormat } from "./model";

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Loads the book, renders it in the chosen format and downloads it. Heavy modules load on demand. */
export async function exportBook(bookId: string, format: ExportFormat, langs: Lang[]): Promise<string> {
  const m = await loadManuscript(bookId, langs);
  const base = safeFilename(`${m.book.documentRef ? m.book.documentRef + " " : ""}${m.book.title} ${langs.join("-").toUpperCase()}`);

  if (format === "docx") {
    const [{ Packer }, { buildDocx }] = await Promise.all([import("docx"), import("./docx")]);
    const blob = await Packer.toBlob(await buildDocx(m));
    saveBlob(blob, `${base}.docx`);
    return `${base}.docx`;
  }
  if (format === "pdf") {
    const [{ buildPdfDefinition }, { renderPdf }] = await Promise.all([import("./pdf"), import("./pdf-browser")]);
    saveBlob(await renderPdf(buildPdfDefinition(m)), `${base}.pdf`);
    return `${base}.pdf`;
  }
  if (format === "epub") {
    const { buildEpub } = await import("./epub");
    const zip = await buildEpub(m);
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
    saveBlob(blob, `${base}.epub`);
    return `${base}.epub`;
  }
  const { buildScorm } = await import("./scorm");
  const zip = await buildScorm(m);
  saveBlob(await zip.generateAsync({ type: "blob" }), `${base}-SCORM12.zip`);
  return `${base}-SCORM12.zip`;
}
