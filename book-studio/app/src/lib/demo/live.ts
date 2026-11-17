// Live-AI switch for the demo. The access code is kept in this browser only.
const CODE_KEY = "book-studio-demo:live-code";

export const LIVE_URL = (import.meta.env.VITE_LIVE_AI_URL as string | undefined) || "/api/ai";

export function liveCode(): string | null {
  try {
    return localStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
}

export function setLiveCode(code: string | null) {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch { /* storage blocked: live AI stays off */ }
  window.dispatchEvent(new Event("book-studio-live-ai"));
}

export async function liveFetch(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  return fetch(LIVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Demo-Code": liveCode() ?? "" },
    body: JSON.stringify(body),
    signal,
  });
}

/** Checks a code against the server without calling the AI. */
export async function verifyCode(code: string): Promise<string | null> {
  try {
    const res = await fetch(LIVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Demo-Code": code },
      body: JSON.stringify({ op: "ping" }),
    });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.error ?? `The server answered ${res.status}.`;
  } catch {
    return "Couldn't reach the live AI server.";
  }
}
