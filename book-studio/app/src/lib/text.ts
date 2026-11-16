// The manual text format shared by the editor, the AI and every exporter:
// paragraphs separated by blank lines, "## " subheadings, "- " bullets, "1. " numbered items.

export type Block =
  | { type: "h"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

const BULLET = /^\s*[-•*]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^\s*#{2,3}\s+(.*)$/;

export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ").replace(/\s+/g, " ").trim() });
    para = [];
  };
  for (const raw of (body ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(HEADING))) {
      flushPara();
      blocks.push({ type: "h", text: m[1].trim() });
    } else if ((m = line.match(BULLET))) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last?.type === "ul") last.items.push(m[1].trim());
      else blocks.push({ type: "ul", items: [m[1].trim()] });
    } else if ((m = line.match(NUMBERED))) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last?.type === "ol") last.items.push(m[1].trim());
      else blocks.push({ type: "ol", items: [m[1].trim()] });
    } else {
      // A plain line straight after a list item continues that item.
      const last = blocks[blocks.length - 1];
      if (!para.length && last && (last.type === "ul" || last.type === "ol") && /^\s{2,}/.test(raw)) {
        last.items[last.items.length - 1] += " " + line.trim();
      } else {
        para.push(line.trim());
      }
    }
  }
  flushPara();
  return blocks;
}

export function wordCount(body: string): number {
  const m = (body ?? "").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

/** Count of [CITATION NEEDED: …] markers still in the text. */
export function citationGaps(body: string): number {
  return ((body ?? "").match(/\[CITATION NEEDED[^\]]*\]/gi) ?? []).length;
}

const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/;

/** Split text into runs of Georgian and non-Georgian characters (for font switching in PDFs). */
export function scriptRuns(text: string): { text: string; georgian: boolean }[] {
  const runs: { text: string; georgian: boolean }[] = [];
  for (const ch of text) {
    const g = GEORGIAN.test(ch);
    // Spaces and punctuation stay with the current run to avoid needless switches.
    const neutral = /[\s.,;:!?()\-–—"'«»„“”0-9]/.test(ch);
    const last = runs[runs.length - 1];
    if (last && (last.georgian === g || neutral)) last.text += ch;
    else runs.push({ text: ch, georgian: g });
  }
  return runs;
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}
