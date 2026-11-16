// SCORM 1.2 package: one SCO per chapter. Each page reports "incomplete" when
// opened and "completed" when the learner confirms they've read it (or reaches
// the end of the page), so an LMS can track progress through the manual.
import JSZip from "jszip";
import { escapeXml, parseBlocks } from "../lib/text";
import { chapterTitleFor, langHeading, type Manuscript } from "./model";

const API_JS = `// Minimal SCORM 1.2 runtime wrapper.
(function () {
  function findAPI(win) {
    var tries = 0;
    while (win && !win.API && win.parent && win.parent !== win && tries < 10) { win = win.parent; tries++; }
    return win && win.API ? win.API : null;
  }
  var api = findAPI(window) || (window.opener ? findAPI(window.opener) : null);
  var finished = false;
  window.BookStudioSCO = {
    start: function () {
      if (!api) return;
      api.LMSInitialize("");
      var status = api.LMSGetValue("cmi.core.lesson_status");
      if (status === "not attempted" || status === "") {
        api.LMSSetValue("cmi.core.lesson_status", "incomplete");
        api.LMSCommit("");
      }
    },
    complete: function () {
      if (!api) return;
      api.LMSSetValue("cmi.core.lesson_status", "completed");
      api.LMSCommit("");
    },
    finish: function () {
      if (!api || finished) return;
      finished = true;
      api.LMSFinish("");
    },
    connected: function () { return !!api; }
  };
  window.addEventListener("load", function () { window.BookStudioSCO.start(); });
  window.addEventListener("beforeunload", function () { window.BookStudioSCO.finish(); });
})();`;

const CSS = `body{font-family:system-ui,-apple-system,"Segoe UI","Noto Sans","Noto Sans Georgian",sans-serif;line-height:1.6;color:#1b1b1b;max-width:760px;margin:0 auto;padding:24px 20px 80px}
h1{font-size:1.6rem;margin:.2em 0}.sub{color:#555;margin-top:0}h2{margin-top:1.6em}h3{margin-top:1.2em}
.done{margin-top:40px;padding:14px 16px;border:1px solid #ccc;border-radius:8px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
button{font:inherit;padding:8px 14px;border-radius:6px;border:0;background:var(--brand);color:#fff;cursor:pointer}
.ok{color:#2f7a4b;font-weight:600}`;

function page(m: Manuscript, idx: number): string {
  const c = m.chapters[idx];
  const lead = m.langs[0];
  const sections = m.langs
    .map((lang) => {
      const text = c.text[lang];
      const body = text?.trim()
        ? parseBlocks(text)
          .map((b) =>
            b.type === "h"
              ? `<h3>${escapeXml(b.text)}</h3>`
              : b.type === "p"
              ? `<p>${escapeXml(b.text)}</p>`
              : `<${b.type}>${b.items.map((i) => `<li>${escapeXml(i)}</li>`).join("")}</${b.type}>`
          )
          .join("\n")
        : `<p><em>Not written in this language yet.</em></p>`;
      return `<section lang="${lang}">${m.langs.length > 1 ? `<h2>${escapeXml(langHeading(lang))}</h2>` : ""}${body}</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="${lead}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeXml(chapterTitleFor(c, lead))}</title>
<style>:root{--brand:${m.org.brandColor}}</style>
<link rel="stylesheet" href="shared/style.css"><script src="shared/scorm.js"></script></head>
<body>
<p class="sub">${escapeXml(m.book.title)}</p>
<h1>${c.number}. ${escapeXml(chapterTitleFor(c, lead))}</h1>
${m.langs.length > 1 && c.title[m.langs[1]] ? `<p class="sub" lang="${m.langs[1]}">${escapeXml(chapterTitleFor(c, m.langs[1]))}</p>` : ""}
${sections}
<div class="done"><button id="done" type="button">I have read this chapter</button><span id="msg"></span></div>
<script>
document.getElementById("done").addEventListener("click", function () {
  window.BookStudioSCO.complete();
  document.getElementById("msg").textContent = window.BookStudioSCO.connected() ? "Marked as complete." : "Opened outside an LMS: progress is not recorded.";
  document.getElementById("msg").className = "ok";
});
</script>
</body>
</html>`;
}

export function manifest(m: Manuscript): string {
  const ident = `BOOKSTUDIO-${m.book.id}`;
  const lead = m.langs[0];
  const items = m.chapters
    .map((c, i) => `      <item identifier="ITEM-${i + 1}" identifierref="RES-${i + 1}" isvisible="true">
        <title>${escapeXml(`${c.number}. ${chapterTitleFor(c, lead)}`)}</title>
      </item>`)
    .join("\n");
  const resources = m.chapters
    .map((_, i) => `    <resource identifier="RES-${i + 1}" type="webcontent" adlcp:scormtype="sco" href="chapter-${i + 1}.html">
      <file href="chapter-${i + 1}.html"/>
      <dependency identifierref="SHARED"/>
    </resource>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${ident}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${escapeXml(m.book.title)}</title>
${items}
    </organization>
  </organizations>
  <resources>
${resources}
    <resource identifier="SHARED" type="webcontent" adlcp:scormtype="asset">
      <file href="shared/scorm.js"/>
      <file href="shared/style.css"/>
    </resource>
  </resources>
</manifest>`;
}

export async function buildScorm(m: Manuscript): Promise<JSZip> {
  const zip = new JSZip();
  zip.file("imsmanifest.xml", manifest(m));
  zip.file("shared/scorm.js", API_JS);
  zip.file("shared/style.css", CSS);
  m.chapters.forEach((_, i) => zip.file(`chapter-${i + 1}.html`, page(m, i)));
  return zip;
}
