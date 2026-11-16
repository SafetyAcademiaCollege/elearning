// Stripe webhook: keeps each organisation's plan and subscription status in step
// with Stripe. Configure the endpoint in Stripe for:
//   checkout.session.completed, customer.subscription.created,
//   customer.subscription.updated, customer.subscription.deleted

import Stripe from "npm:stripe@23.1.0";
import { adminClient, env } from "../_shared/clients.ts";
import { planForPrice } from "../_shared/plans.ts";

const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();

const STATUS_MAP: Record<string, string> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "unpaid",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  paused: "past_due",
};

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  if (!signature) return new Response("missing signature", { status: 400 });
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, env("STRIPE_WEBHOOK_SECRET"), undefined, crypto);
  } catch (err) {
    console.error("bad signature", err);
    return new Response("bad signature", { status: 400 });
  }

  const admin = adminClient();
  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const orgId = s.client_reference_id ?? s.metadata?.org_id;
      if (orgId && typeof s.subscription === "string") {
        await admin.from("organizations").update({ stripe_subscription_id: s.subscription }).eq("id", orgId);
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.org_id ?? (await orgByCustomer(String(sub.customer)));
      if (!orgId) return new Response("no org", { status: 200 });

      const deleted = event.type === "customer.subscription.deleted";
      const plan = planForPrice(sub.items.data[0]?.price?.id) ?? sub.metadata?.plan ?? null;
      const update: Record<string, unknown> = {
        subscription_status: deleted ? "canceled" : (STATUS_MAP[sub.status] ?? "past_due"),
        stripe_subscription_id: deleted ? null : sub.id,
      };
      if (plan && !deleted) update.plan_id = plan;
      const { error } = await admin.from("organizations").update(update).eq("id", orgId);
      if (error) throw error;
      await admin.from("audit_events").insert({
        org_id: orgId,
        event: "subscription_" + event.type.split(".").pop(),
        detail: { status: update.subscription_status, plan },
      });
    }
  } catch (err) {
    console.error(err);
    return new Response("handler error", { status: 500 }); // Stripe will retry
  }
  return new Response("ok", { status: 200 });
});

async function orgByCustomer(customer: string): Promise<string | null> {
  const { data } = await adminClient().from("organizations").select("id").eq("stripe_customer_id", customer).maybeSingle();
  return data?.id ?? null;
}
