// Team management that needs auth-admin rights.
//
// POST /functions/v1/team
//   { op: "invite", org_id, email, roles }        owner (or platform admin) adds a person
//   { op: "create_org", name, plan, owner_email }  platform admin creates an organisation and invites its owner

import { adminClient, env, isPlatformAdmin, requireRole, requireUser, userClient } from "../_shared/clients.ts";
import { handleError, HttpError, json, preflight } from "../_shared/http.ts";

const ROLES = ["owner", "author", "reviewer", "approver"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    const db = userClient(req);
    await requireUser(db);
    const body = await req.json().catch(() => ({}));

    if (body.op === "invite") {
      const orgId = String(body.org_id ?? "");
      if (!(await isPlatformAdmin(db))) await requireRole(db, orgId, "owner");
      const result = await invite(orgId, String(body.email ?? ""), body.roles);
      return json(result);
    }

    if (body.op === "create_org") {
      if (!(await isPlatformAdmin(db))) throw new HttpError(403, "Only platform administrators can create organisations.");
      const { data: org, error } = await db.rpc("admin_create_org", {
        p_name: String(body.name ?? "").trim(),
        p_plan: String(body.plan ?? "pilot"),
      });
      if (error) throw new HttpError(400, error.message);
      const result = await invite(org.id, String(body.owner_email ?? ""), ["owner"]);
      return json({ org, ...result });
    }

    throw new HttpError(400, "Unknown operation.");
  } catch (err) {
    return handleError(err);
  }
});

async function invite(orgId: string, rawEmail: string, rawRoles: unknown) {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(400, "Enter a valid email address.");
  const roles = Array.isArray(rawRoles) ? rawRoles.map(String).filter((r) => ROLES.includes(r)) : [];
  if (!roles.length) throw new HttpError(400, "Choose at least one role.");

  const admin = adminClient();
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id, plans(seats)")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) throw new HttpError(404, "Organisation not found.");

  const { count } = await admin.from("memberships").select("user_id", { count: "exact", head: true }).eq("org_id", orgId);
  const seats = (org as unknown as { plans: { seats: number } }).plans.seats;

  // Existing account?
  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  let userId = profile?.id as string | undefined;
  let invited = false;

  if (userId) {
    const { data: existing } = await admin.from("memberships").select("user_id").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
    if (!existing && (count ?? 0) >= seats) {
      throw new HttpError(402, `Your plan includes ${seats} seats and all are taken. Remove someone or upgrade the plan.`, "seats_full");
    }
  } else {
    if ((count ?? 0) >= seats) {
      throw new HttpError(402, `Your plan includes ${seats} seats and all are taken. Remove someone or upgrade the plan.`, "seats_full");
    }
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${env("APP_URL")}/welcome`,
    });
    if (error) throw new HttpError(400, `Could not send the invitation: ${error.message}`);
    userId = data.user.id;
    invited = true;
  }

  const { error: memErr } = await admin
    .from("memberships")
    .upsert({ org_id: orgId, user_id: userId, roles }, { onConflict: "org_id,user_id" });
  if (memErr) throw memErr;

  await admin.from("audit_events").insert({
    org_id: orgId,
    event: "member_added",
    detail: { email, roles, invited },
  });
  return { user_id: userId, invited };
}
