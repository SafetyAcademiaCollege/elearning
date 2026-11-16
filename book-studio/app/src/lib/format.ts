export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function safeFilename(s: string): string {
  const cleaned = (s || "").replace(/[^\p{L}\p{N}\- _]+/gu, "").trim().replace(/\s+/g, "-").slice(0, 80);
  return cleaned || "manuscript";
}
