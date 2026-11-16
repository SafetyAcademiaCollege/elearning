import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { callFunction, errorMessage } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/ui";
import { fmtDate } from "../lib/format";
import type { Plan } from "../lib/types";

interface OrgRow { id: string; name: string; plan_id: string; subscription_status: string; created_at: string }

/** Platform administration: create organisations and invite their owners. */
export default function Admin() {
  const { isPlatformAdmin, loading } = useSession();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({ name: "", plan: "pilot", owner_email: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const [o, p] = await Promise.all([
      supabase.from("organizations").select("id, name, plan_id, subscription_status, created_at").order("created_at", { ascending: false }),
      supabase.from("plans").select("*").order("sort"),
    ]);
    setOrgs((o.data ?? []) as OrgRow[]);
    setPlans((p.data ?? []) as Plan[]);
  }, []);
  useEffect(() => { if (isPlatformAdmin) load(); }, [isPlatformAdmin, load]);

  if (loading) return <Loading />;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await callFunction("team", { op: "create_org", ...form });
      setMsg({ kind: "ok", text: `Created ${form.name} and invited ${form.owner_email} as owner.` });
      setForm({ name: "", plan: "pilot", owner_email: "" });
      load();
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Platform admin</h1>
        <Link to="/" className="small">Back</Link>
      </div>
      <div className="studio" style={{ gridTemplateColumns: "minmax(0,1fr) 360px" }}>
        <div className="panel">
          <h2>Organisations ({orgs.length})</h2>
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Name</th><th>Plan</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/o/${o.id}`}>{o.name}</Link></td>
                    <td>{o.plan_id}</td>
                    <td>{o.subscription_status}</td>
                    <td>{fmtDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">To open an organisation's content you must also be a member of it. Plan changes for pilot partners and AI allowance overrides are made in the database (see the operations guide).</p>
        </div>
        <form className="panel stack" onSubmit={create}>
          <h2>New organisation</h2>
          <label className="field">Organisation name
            <input id="org-name" type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">Plan
            <select id="org-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.seats} seats · ${p.ai_monthly_budget_usd} AI/month</option>)}
            </select>
          </label>
          <label className="field">Owner's email
            <span className="hint">They receive an invitation email and become the organisation's owner.</span>
            <input id="org-owner" type="email" required value={form.owner_email} onChange={(e) => setForm({ ...form, owner_email: e.target.value })} />
          </label>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <button className="btn" disabled={busy}>Create and invite</button>
        </form>
      </div>
    </div>
  );
}
