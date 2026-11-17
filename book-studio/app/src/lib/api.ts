import { DEMO, functionsUrl, supabase } from "./supabase";
import { demoFunction, DemoError, demoStream } from "./demo/functions";
import type { Lang } from "./types";

export class ApiError extends Error {
  constructor(message: string, public code = "error", public status = 0) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("Your session has expired. Sign in again.", "unauthenticated", 401);
  return {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    "Content-Type": "application/json",
  };
}

export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  if (DEMO) {
    try {
      return (await demoFunction(name, body)) as T;
    } catch (err) {
      throw new ApiError(err instanceof DemoError ? err.message : "Something went wrong in the demo.", "demo");
    }
  }
  const res = await fetch(`${functionsUrl}/${name}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status}).`, data.code, res.status);
  return data as T;
}

export interface StreamDone {
  version_id: number;
  model: string;
  truncated: boolean;
}

/** Calls the AI gateway's streaming operations (draft / adapt), reporting text as it arrives. */
export async function streamProse(
  body: { op: "draft"; chapter_id: string; lang: Lang } | { op: "adapt"; chapter_id: string; from: Lang; to: Lang },
  onText: (fullText: string) => void,
  signal?: AbortSignal,
): Promise<StreamDone> {
  if (DEMO) {
    try {
      return await demoStream(body, onText, signal);
    } catch (err) {
      throw new ApiError(err instanceof DemoError ? err.message : "Something went wrong in the demo.", "demo");
    }
  }
  const res = await fetch(`${functionsUrl}/ai`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error ?? `Request failed (${res.status}).`, data.code, res.status);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6));
      if (event.type === "delta") {
        text += event.text;
        onText(text);
      } else if (event.type === "done") {
        return event as StreamDone;
      } else if (event.type === "error") {
        throw new ApiError(event.message, event.code);
      }
    }
  }
  throw new ApiError("The connection closed before the AI finished. Your text may still have been saved; reload to check.", "stream_closed");
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const m = String((err as { message: unknown }).message);
    // Postgres errors raised by our functions are written for users already.
    return m.replace(/^.*?ERROR:\s*/, "");
  }
  return "Something went wrong. Try again.";
}
