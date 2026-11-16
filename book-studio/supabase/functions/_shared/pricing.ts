// AI model choice and cost accounting. Pure module: no Deno APIs, so it is
// unit-tested from the app's test suite too.

export type Op = "blueprint" | "draft" | "adapt" | "check";

/** Default model per operation. Override with DRAFT_MODEL / ADAPT_MODEL / CHECK_MODEL / BLUEPRINT_MODEL. */
export const DEFAULT_MODELS: Record<Op, string> = {
  draft: "claude-opus-5-5",
  adapt: "claude-opus-5-5",
  blueprint: "claude-haiku-5-5",
  check: "claude-haiku-5-5",
};

// USD per million tokens [input, output]. Keep in step with Anthropic's price list.
const PRICES: Record<string, [number, number]> = {
  "claude-fable-5-2": [8, 40],
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
// Unknown models (e.g. a server-side fallback) are charged at a conservative rate.
const UNKNOWN: [number, number] = [8, 40];

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function priceFor(model: string): [number, number] {
  return PRICES[model] ?? PRICES[model.replace(/-\d{8}$/, "")] ?? UNKNOWN;
}

/** Cost in USD, rounded to 6 decimals. Cache writes at 1.25x input, reads at 0.1x input. */
export function costUsd(model: string, u: Usage): number {
  let [inP, outP] = priceFor(model);
  // Haiku 5.5 prices double beyond 100K prompt tokens.
  const prompt = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  if (model === "claude-haiku-5-5" && prompt > 100_000) {
    inP = 0.5;
    outP = 2.5;
  }
  const cost =
    (u.input_tokens * inP +
      (u.cache_creation_input_tokens ?? 0) * inP * 1.25 +
      (u.cache_read_input_tokens ?? 0) * inP * 0.1 +
      u.output_tokens * outP) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

/** Rough upper bound for one call, used to refuse a call that would clearly overrun the allowance. */
export function estimateMaxCost(op: Op, model: string, promptChars: number): number {
  const inputTokens = Math.ceil(promptChars / 2); // Georgian text tokenises densely; stay pessimistic
  const outputTokens = op === "draft" || op === "adapt" ? 20_000 : 6_000;
  return costUsd(model, { input_tokens: inputTokens, output_tokens: outputTokens });
}
