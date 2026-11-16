import { describe, expect, it } from "vitest";
import { citationGaps, parseBlocks, scriptRuns, wordCount } from "../src/lib/text";

describe("manual text format", () => {
  it("parses headings, paragraphs and both list kinds", () => {
    const blocks = parseBlocks("Intro line one\nline two\n\n## Scope\n- a\n- b\n\n1. first\n2) second\n\nEnd.");
    expect(blocks).toEqual([
      { type: "p", text: "Intro line one line two" },
      { type: "h", text: "Scope" },
      { type: "ul", items: ["a", "b"] },
      { type: "ol", items: ["first", "second"] },
      { type: "p", text: "End." },
    ]);
  });

  it("handles empty and Windows line endings", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks("a\r\n\r\nb")).toEqual([{ type: "p", text: "a" }, { type: "p", text: "b" }]);
  });

  it("counts words in English and Georgian", () => {
    expect(wordCount("Pre-flight checks, done twice.")).toBe(4);
    expect(wordCount("ფრენის წინა შემოწმება")).toBe(3);
  });

  it("counts citation gaps", () => {
    expect(citationGaps("A [CITATION NEEDED: x] b [citation needed]")).toBe(2);
  });

  it("splits Georgian and Latin runs, keeping punctuation with the current run", () => {
    expect(scriptRuns("ICAO და EASA, 2024.")).toEqual([
      { text: "ICAO ", georgian: false },
      { text: "და ", georgian: true },
      { text: "EASA, 2024.", georgian: false },
    ]);
    expect(scriptRuns("ᲓᲘᲓᲘ")[0].georgian).toBe(true); // Mtavruli capitals
  });
});
