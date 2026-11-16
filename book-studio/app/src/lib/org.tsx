import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import type { Organization, Plan, Role } from "./types";
import { useSession } from "./session";

export interface OrgState {
  org: Organization;
  plan: Plan;
  roles: Role[];
  can: (role: Role) => boolean;
  logoUrl: string | null;
  reload: () => Promise<void>;
}

const Ctx = createContext<OrgState | null>(null);

export function OrgProvider({ orgId, children, fallback }: { orgId: string; children: ReactNode; fallback: ReactNode }) {
  const { session } = useSession();
  const [state, setState] = useState<OrgState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [org, mem] = await Promise.all([
      supabase.from("organizations").select("*, plans(*)").eq("id", orgId).maybeSingle(),
      supabase.from("memberships").select("roles").eq("org_id", orgId).eq("user_id", session.user.id).maybeSingle(),
    ]);
    if (org.error || !org.data) {
      setError("You don't have access to this organisation.");
      return;
    }
    const roles = (mem.data?.roles ?? []) as Role[];
    let logoUrl: string | null = null;
    if (org.data.logo_path) {
      const { data } = await supabase.storage.from("org-assets").createSignedUrl(org.data.logo_path, 3600);
      logoUrl = data?.signedUrl ?? null;
    }
    const { plans, ...rest } = org.data as Organization & { plans: Plan };
    setState({
      org: rest,
      plan: plans,
      roles,
      can: (r: Role) => roles.includes("owner") || roles.includes(r),
      logoUrl,
      reload: load,
    });
  }, [orgId, session]);

  useEffect(() => {
    setState(null);
    setError(null);
    load();
  }, [load]);

  if (error) return <div className="page-msg">{error}</div>;
  if (!state) return <>{fallback}</>;
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useOrg(): OrgState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOrg outside OrgProvider");
  return v;
}
