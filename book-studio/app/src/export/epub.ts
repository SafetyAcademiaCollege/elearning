// EPUB 3 (with an EPUB 2 NCX for older readers), built with JSZip.
import JSZip from "jszip";
import { fmtDate } from "../lib/format";
import { escapeXml, parseBlocks } from "../lib/text";
import { chapterTitleFor, DISCLOSURE_NOTE, documentRevision, langHeading, type Manuscript, provenanceLabel } from "./model";

const CSS = `body{font-family:serif;line-height:1.5;margin:0 5%}
h1{font-size:1.6em;margin:1.2em 0 .3em}h2{font-size:1.25em;margin:1.2em 0 .4em}h3{font-size:1.05em;margin:1em 0 .3em}
.meta{font-size:.75em;color:#666}.sub{color:#555;margin-top:0}
table{border-collapse:collapse;width:100%;font-size:.85em}td,th{border:1px solid #bbb;padding:.3em .5em;text-align:left}
:lang(ka){font-family:"Noto Serif Georgian","Noto Sans Georgian",serif}`;

function xhtml(title: string, lang: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head><meta charset="UTF-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>`;
}

function blocksHtml(text: string): string {
  return parseBlocks(text)
    .map((b) => {
      if (b.type === "h") return `<h3>${escapeXml(b.text)}</h3>`;
      if (b.type === "p") return `<p>${escapeXml(b.text)}</p>`;
      const tag = b.type === "ul" ? "ul" : "ol";
      return `<${tag}>${b.items.map((i) => `<li>${escapeXml(i)}</li>`).join("")}</${tag}>`;
    })
    .join("\n");
}

export function chapterHtml(m: Manuscript, idx: number): string {
  const c = m.chapters[idx];
  const lead = m.langs[0];
  const parts: string[] = [`<h1>${c.number}. ${escapeXml(chapterTitleFor(c, lead))}</h1>`];
  if (m.langs.length > 1 && c.title[m.langs[1]]) parts.push(`<p class="sub" lang="${m.langs[1]}">${escapeXml(chapterTitleFor(c, m.langs[1]))}</p>`);
  for (const lang of m.langs) {
    parts.push(`<section lang="${lang}" xml:lang="${lang}">`);
    if (m.langs.length > 1) parts.push(`<h2>${escapeXml(langHeading(lang))}</h2>`);
    parts.push(c.text[lang]?.trim() ? blocksHtml(c.text[lang]) : `<p class="meta">Not written in this language yet.</p>`);
    parts.push(`</section>`);
  }
  if (c.sources.length) {
    parts.push(`<h3>Sources</h3><ul>${c.sources.map((s) => `<li>${escapeXml(s.title)}${s.reference ? ` — ${escapeXml(s.reference)}` : ""}</li>`).join("")}</ul>`);
  }
  return xhtml(chapterTitleFor(c, lead), lead, parts.join("\n"));
}

export async function buildEpub(m: Manuscript): Promise<JSZip> {
  const zip = new JSZip();
  const lead = m.langs[0];
  const id = `urn:uuid:${m.book.id}`;
  const modified = new Date(m.generatedAt).toISOString().replace(/\.\d{3}Z$/, "Z");

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );
  const o = zip.folder("OEBPS")!;
  o.file("style.css", CSS);

  o.file(
    "title.xhtml",
    xhtml(m.book.title, lead, `<section epub:type="titlepage">
<p class="meta">${escapeXml(m.org.name)}</p>
<h1>${escapeXml(m.book.title)}</h1>
${m.book.subtitle ? `<p class="sub">${escapeXml(m.book.subtitle)}</p>` : ""}
<p class="meta">${escapeXml([m.book.documentRef, documentRevision(m), fmtDate(m.generatedAt)].filter(Boolean).join(" · "))}</p>
</section>`),
  );

  m.chapters.forEach((_, i) => o.file(`chapter-${i + 1}.xhtml`, chapterHtml(m, i)));

  if (m.includeAuthorship) {
    o.file(
      "provenance.xhtml",
      xhtml("Authorship and AI provenance", lead, `<h1>Authorship and AI provenance</h1>
  <p>${escapeXml(DISCLOSURE_NOTE)}</p>
  <table><thead><tr><th>No.</th><th>Chapter</th>${m.langs.map((l) => `<th>${escapeXml(langHeading(l))}</th>`).join("")}</tr></thead>
  <tbody>${m.chapters.map((c) => `<tr><td>${c.number}</td><td>${escapeXml(chapterTitleFor(c, lead))}</td>${m.langs.map((l) => `<td>${escapeXml(provenanceLabel(c, l))}</td>`).join("")}</tr>`).join("")}</tbody></table>`),
    );
  }

  const navItems = m.chapters
    .map((c, i) => `<li><a href="chapter-${i + 1}.xhtml">${c.number}. ${escapeXml(chapterTitleFor(c, lead))}</a></li>`)
    .join("\n");
  o.file(
    "nav.xhtml",
    xhtml("Contents", lead, `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
<li><a href="title.xhtml">${escapeXml(m.book.title)}</a></li>
${navItems}
${m.includeAuthorship ? `<li><a href="provenance.xhtml">Authorship and AI provenance</a></li>\n` : ""}</ol></nav>`),
  );

  const spine = ["title", ...m.chapters.map((_, i) => `chapter-${i + 1}`), ...(m.includeAuthorship ? ["provenance"] : [])];
  o.file(
    "toc.ncx",
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${id}"/></head>
<docTitle><text>${escapeXml(m.book.title)}</text></docTitle>
<navMap>
${spine.map((s, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(
      s === "title" ? m.book.title : s === "provenance" ? "Authorship and AI provenance" : `${m.chapters[i - 1].number}. ${chapterTitleFor(m.chapters[i - 1], lead)}`,
    )}</text></navLabel><content src="${s}.xhtml"/></navPoint>`).join("\n")}
</navMap>
</ncx>`,
  );

  o.file(
    "content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lead}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="bookid">${id}</dc:identifier>
  <dc:title>${escapeXml(m.book.title)}</dc:title>
  ${m.langs.map((l) => `<dc:language>${l}</dc:language>`).join("\n  ")}
  <dc:creator>${escapeXml(m.org.name)}</dc:creator>
  <dc:publisher>${escapeXml(m.org.name)}</dc:publisher>
  <meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  <item id="css" href="style.css" media-type="text/css"/>
  ${spine.map((s) => `<item id="${s}" href="${s}.xhtml" media-type="application/xhtml+xml"/>`).join("\n  ")}
</manifest>
<spine toc="ncx">
  ${spine.map((s) => `<itemref idref="${s}"/>`).join("\n  ")}
</spine>
</package>`,
  );
  return zip;
}
