import { describe, expect, it } from "vitest";
import { costUsd, estimateMaxCost, priceFor } from "../../supabase/functions/_shared/pricing";
import { adaptPrompt, draftPrompt, glossaryBlock, parseBlueprint, parseFlags, parseSuggestions, sourcesBlock, suggestPrompt } from "../../supabase/functions/_shared/prompts";

const ctx = { orgName: "Caucasus Flight Academy", bookTitle: "ATO Training Manual", chapterTitles: ["Part A — General", "Part B — Flight Training"] };

describe("cost accounting", () => {
  it("prices Opus 5.5 and Haiku 5.5", () => {
    expect(costUsd("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(24);
    expect(costUsd("claude-haiku-5-5", { input_tokens: 10_000, output_tokens: 2_000 })).toBe(0.002);
  });
  it("applies Haiku's long-prompt tier and cache rates", () => {
    expect(costUsd("claude-haiku-5-5", { input_tokens: 200_000, output_tokens: 0 })).toBe(0.1);
    expect(costUsd("claude-opus-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 })).toBe(0.4);
  });
  it("charges unknown models conservatively and strips date suffixes", () => {
    expect(priceFor("claude-unknown")).toEqual([8, 40]);
    expect(priceFor("claude-opus-5-5-20260101")).toEqual([4, 20]);
  });
  it("estimates a pessimistic ceiling for a draft", () => {
    expect(estimateMaxCost("draft", "claude-opus-5-5", 20_000)).toBeGreaterThan(0.4);
  });
});

describe("prompts", () => {
  it("tells the model to mark unsupported claims when no sources are linked", () => {
    const p = draftPrompt({ ctx, lang: "ka", chapterTitle: "ნაწილი A", goal: "g", existingText: "", sources: [], glossary: [] });
    expect(p).toContain("Treat every specific regulatory claim as needing a citation");
    expect(p).toContain("Georgian");
    expect(p).toContain('"## "');
  });
  it("includes the author's existing text so drafting builds on it", () => {
    const p = draftPrompt({ ctx, lang: "en", chapterTitle: "A", goal: "g", existingText: "My notes", sources: [], glossary: [] });
    expect(p).toContain("<author_text>\nMy notes\n</author_text>");
  });
  it("bounds source excerpts", () => {
    const big = "x".repeat(20_000);
    const block = sourcesBlock(Array.from({ length: 8 }, (_, i) => ({ title: `S${i}`, reference: "", kind: "regulation", excerpt: big })));
    expect(block.length).toBeLessThan(80_000);
    expect(block).toContain("[excerpt truncated]");
    expect(block).toContain("source library limit reached");
  });
  it("renders the glossary and keeps markers during adaptation", () => {
    expect(glossaryBlock([{ term_en: "go-around", term_ka: "წრეზე წასვლა", note: "" }])).toContain("go-around = წრეზე წასვლა");
    expect(adaptPrompt({ ctx, from: "en", to: "ka", chapterTitle: "A", sourceText: "t", glossary: [] })).toContain("[CITATION NEEDED] marker");
  });
  it("parses structured replies defensively", () => {
    expect(parseFlags('{"flags":[{"type":"Needs citation","note":"Cite ORA.ATO.230."},{"type":"x","note":"  "}]}')).toEqual([
      { type: "Needs citation", note: "Cite ORA.ATO.230." },
    ]);
    expect(parseFlags("not json")).toEqual([]);
    expect(parseBlueprint('Here: {"chapters":[{"title_en":"Intro","title_ka":"შესავალი","goal":"g"}]}')).toHaveLength(1);
  });
  it("suggest mode forbids writing replacement text and covers an empty chapter", () => {
    const withText = suggestPrompt({ ctx, lang: "ka", chapterTitle: "A", goal: "g", text: "My draft", sources: [], glossary: [] });
    expect(withText).toContain("do not write replacement sentences");
    expect(withText).toContain("<author_draft");
    const empty = suggestPrompt({ ctx, lang: "en", chapterTitle: "A", goal: "g", text: "  ", sources: [], glossary: [] });
    expect(empty).toContain("not written yet");
    expect(empty).not.toContain("<author_draft");
    expect(parseSuggestions('{"suggestions":[{"type":"Structure","note":"Start with the purpose."}]}')).toEqual([
      { type: "Structure", note: "Start with the purpose." },
    ]);
  });
});
