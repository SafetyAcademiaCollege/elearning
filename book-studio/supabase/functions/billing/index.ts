// Stripe Checkout and Customer Portal for organisation owners.
//
// POST /functions/v1/billing
//   { op: "checkout", org_id, plan: "starter" | "team" }  -> { url }
//   { op: "portal",   org_id }                             -> { url }

import Stripe from "npm:stripe@23.1.0";
import { adminClient, env, requireRole, requireUser, userClient } from "../_shared/clients.ts";
import { handleError, HttpError, json, preflight } from "../_shared/http.ts";
import { type PaidPlan, priceIdFor } from "../_shared/plans.ts";

const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    const db = userClient(req);
    const user = await requireUser(db);
    const body = await req.json().catch(() => ({}));
    const orgId = String(body.org_id ?? "");
    await requireRole(db, orgId, "owner");

    const admin = adminClient();
    const { data: org, error } = await admin
      .from("organizations")
      .select("id, name, stripe_customer_id, stripe_subscription_id")
      .eq("id", orgId)
      .single();
    if (error) throw error;

    let customer = org.stripe_customer_id as string | null;
    if (!customer) {
      const created = await stripe.customers.create({
        name: org.name,
        email: user.email ?? undefined,
        metadata: { org_id: org.id },
      });
      customer = created.id;
      await admin.from("organizations").update({ stripe_customer_id: customer }).eq("id", org.id);
    }

    const appUrl = env("APP_URL");
    if (body.op === "checkout") {
      const plan = body.plan as PaidPlan;
      if (plan !== "starter" && plan !== "team") throw new HttpError(400, "Choose Starter or Team.");
      if (org.stripe_subscription_id) {
        throw new HttpError(409, "You already have a subscription. Use Manage billing to change plan.", "has_subscription");
      }
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        client_reference_id: org.id,
        line_items: [{ price: priceIdFor(plan), quantity: 1 }],
        subscription_data: { metadata: { org_id: org.id, plan } },
        metadata: { org_id: org.id, plan },
        allow_promotion_codes: true,
        success_url: `${appUrl}/o/${org.id}/settings?billing=success`,
        cancel_url: `${appUrl}/o/${org.id}/settings?billing=cancelled`,
      });
      return json({ url: session.url });
    }

    if (body.op === "portal") {
      const session = await stripe.billingPortal.sessions.create({
        customer,
        return_url: `${appUrl}/o/${org.id}/settings`,
      });
      return json({ url: session.url });
    }

    throw new HttpError(400, "Unknown operation.");
  } catch (err) {
    return handleError(err);
  }
});
