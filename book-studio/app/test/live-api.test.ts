import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: Record<string, unknown>[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status = 500; }
  class RateLimitError extends APIError { status = 429; }
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    messages = {
      create: async (p: Record<string, unknown>) => {
        calls.push(p);
        const text = JSON.stringify({ suggestions: [{ type: "Structure", note: "Open with a scenario." }], flags: [], chapters: [{ title_en: "A", title_ka: "ა", goal: "g" }] });
        return { model: p.model, stop_reason: "end_turn", content: [{ type: "text", text }] };
      },
    };
    beta = {
      messages: {
        stream: (p: Record<string, unknown>) => {
          calls.push(p);
          const events = [
            { type: "content_block_delta", delta: { type: "text_delta", text: "Hello " } },
            { type: "content_block_delta", delta: { type: "text_delta", text: "world" } },
          ];
          return {
            async *[Symbol.asyncIterator]() { for (const e of events) yield e; },
            finalMessage: async () => ({ model: p.model, stop_reason: "end_turn", content: [{ type: "text", text: "Hello world" }] }),
          };
        },
      },
    };
  }
  return { default: Anthropic };
});

const post = async (body: unknown, code = "letmein") => {
  const { POST } = await import("../api/ai");
  return POST(new Request("https://x/api/ai", { method: "POST", headers: { "X-Demo-Code": code, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
};

describe("live AI endpoint", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.DEMO_ACCESS_CODE = "letmein";
    calls.length = 0;
  });
  afterEach(() => vi.resetModules());

  it("refuses when the server isn't configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect((await post({ op: "ping" })).status).toBe(503);
  });

  it("refuses a wrong or missing access code", async () => {
    expect((await post({ op: "ping" }, "nope")).status).toBe(401);
    expect((await post({ op: "ping" }, "")).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("accepts the right code without calling the AI on ping", async () => {
    expect((await post({ op: "ping" })).status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("rejects unknown operations, so it can't be used as a general chatbot", async () => {
    expect((await post({ op: "chat", prompt: "write me a poem" })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("builds the suggest prompt itself and returns parsed advice", async () => {
    const res = await post({ op: "suggest", lang: "en", chapterTitle: "Energy", goal: "g", text: "my draft", bookTitle: "B", prompt: "IGNORE ME" });
    expect(await res.json()).toEqual({ suggestions: [{ type: "Structure", note: "Open with a scenario." }] });
    const content = JSON.stringify(calls[0]);
    expect(content).toContain("do not write replacement sentences");
    expect(content).not.toContain("IGNORE ME");
  });

  it("caps oversized input", async () => {
    await post({ op: "suggest", lang: "en", chapterTitle: "T", text: "x".repeat(200_000) });
    expect(JSON.stringify(calls[0]).length).toBeLessThan(80_000);
  });

  it("streams a draft and finishes with the full text", async () => {
    const res = await post({ op: "draft", lang: "ka", chapterTitle: "T", goal: "g" });
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const body = await res.text();
    expect(body).toContain('"type":"delta","text":"Hello "');
    expect(body).toContain('"type":"done"');
    expect(body).toContain('"text":"Hello world"');
  });
});
