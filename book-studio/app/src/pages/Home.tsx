import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/session";
import { Loading } from "../components/ui";

interface Row { org_id: string; roles: string[]; organizations: { name: string } | null }

export default function Home() {
  const { session, isPlatformAdmin } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("memberships")
      .select("org_id, roles, organizations(name)")
      .eq("user_id", session.user.id)
      .then(({ data }) => setRows((data ?? []) as unknown as Row[]));
  }, [session]);

  if (!rows) return <Loading />;
  if (rows.length === 1 && !isPlatformAdmin) return <Navigate to={`/o/${rows[0].org_id}`} replace />;

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <h1>Your organisations</h1>
        <button className="btn ghost small" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
      <div className="stack">
        {rows.map((r) => (
          <Link key={r.org_id} className="card" to={`/o/${r.org_id}`}>
            <h3>{r.organizations?.name ?? "Organisation"}</h3>
            <span className="muted small">Your roles: {r.roles.join(", ")}</span>
          </Link>
        ))}
        {!rows.length && (
          <div className="panel">
            <p>You're signed in but not a member of any organisation yet. Ask your organisation's Book Studio owner to invite you.</p>
          </div>
        )}
        {isPlatformAdmin && <Link to="/admin" className="btn secondary" style={{ alignSelf: "flex-start" }}>Platform admin</Link>}
      </div>
    </div>
  );
}
