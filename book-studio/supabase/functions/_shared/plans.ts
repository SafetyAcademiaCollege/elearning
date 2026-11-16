// Stripe price ids per plan come from environment variables, so test and live
// mode can use different prices without code changes.

export type PaidPlan = "starter" | "team";

export function priceIdFor(plan: PaidPlan): string {
  const v = Deno.env.get(plan === "starter" ? "STRIPE_PRICE_STARTER" : "STRIPE_PRICE_TEAM");
  if (!v) throw new Error(`Stripe price for ${plan} is not configured`);
  return v;
}

export function planForPrice(priceId: string | undefined | null): PaidPlan | null {
  if (!priceId) return null;
  if (priceId === Deno.env.get("STRIPE_PRICE_STARTER")) return "starter";
  if (priceId === Deno.env.get("STRIPE_PRICE_TEAM")) return "team";
  return null;
}
