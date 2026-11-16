import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.118.0";
import { HttpError } from "./http.ts";

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

/** Client that acts as the calling user: row-level security applies. */
export function userClient(req: Request): SupabaseClient {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new HttpError(401, "Sign in first.", "unauthenticated");
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
}

/** Service-role client: bypasses RLS. Only use after checking the caller's rights. */
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export async function requireUser(client: SupabaseClient): Promise<User> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Sign in again.", "unauthenticated");
  return data.user;
}

export async function requireRole(client: SupabaseClient, orgId: string, role: string): Promise<void> {
  const { data, error } = await client.rpc("has_role", { p_org: orgId, p_role: role });
  if (error) throw error;
  if (data !== true) throw new HttpError(403, `This needs the ${role} role in your organisation.`, "forbidden");
}

export async function isPlatformAdmin(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc("is_platform_admin");
  if (error) throw error;
  return data === true;
}
