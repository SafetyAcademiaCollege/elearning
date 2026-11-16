import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useOrg } from "../lib/org";
import { callFunction, errorMessage } from "../lib/api";
import { fmtUsd } from "../lib/format";
import { Loading, Notice } from "../components/ui";
import type { Plan } from "../lib/types";

interface UsageRow { op: string; model: string; cost_usd: number; user_id: string | null; created_at: string }

export default function Settings() {
  const { org, plan, can, logoUrl, reload } = useOrg();
  const [params] = useSearchParams();
  const [name, setName] = useState(org.name);
  const [color, setColor] = useState(org.brand_color);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(
    params.get("billing") === "success" ? { kind: "ok", text: "Subscription started. It can take a minute to show here." } : null,
  );
  const [usage, setUsage] = useState<UsageRow[] | null>(null);
  const [budget, setBudget] = useState(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState(false);

  const loadUsage = useCallback(async () => {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const [u, b, p] = await Promise.all([
      supabase.from("ai_usage").select("op, model, cost_usd, user_id, created_at").eq("org_id", org.id).gte("created_at", start.toISOString()),
      supabase.rpc("org_ai_budget", { p_org: org.id }),
      supabase.from("plans").select("*").order("sort"),
    ]);
    setUsage((u.data ?? []) as UsageRow[]);
    setBudget(Number(b.data ?? 0));
    setPlans((p.data ?? []) as Plan[]);
  }, [org.id]);
  useEffect(() => { loadUsage(); }, [loadUsage]);

  if (!can("owner")) return <Navigate to={`/o/${org.id}`} replace />;
  if (!usage) return <Loading />;

  async function saveBranding(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("organizations").update({ name: name.trim(), brand_color: color }).eq("id", org.id);
    setMsg(error ? { kind: "error", text: errorMessage(error) } : { kind: "ok", text: "Saved." });
    reload();
  }

  async function uploadLogo(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setMsg({ kind: "error", text: "Use a PNG or JPEG file." });
      return;
    }
    if (file.size > 1_000_000) {
      setMsg({ kind: "error", text: "Keep the logo under 1 MB." });
      return;
    }
    const path = `${org.id}/logo-${Date.now()}.${file.type === "image/png" ? "png" : "jpg"}`;
    const up = await supabase.storage.from("org-assets").upload(path, file, { contentType: file.type });
    if (up.error) {
      setMsg({ kind: "error", text: errorMessage(up.error) });
      return;
    }
    const old = org.logo_path;
    await supabase.from("organizations").update({ logo_path: path }).eq("id", org.id);
    if (old) await supabase.storage.from("org-assets").remove([old]);
    setMsg({ kind: "ok", text: "Logo updated. It appears on PDF and Word covers." });
    reload();
  }

  async function billing(op: "checkout" | "portal", target?: string) {
    setBusy(true);
    try {
      const { url } = await callFunction<{ url: string }>("billing", { op, org_id: org.id, plan: target });
      window.location.href = url;
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err) });
      setBusy(false);
    }
  }

  const spent = usage.reduce((s, r) => s + Number(r.cost_usd), 0);
  const byOp = usage.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.op]: (acc[r.op] ?? 0) + Number(r.cost_usd) }), {});
  const pct = budget ? Math.min(100, (spent / budget) * 100) : 0;
  const paid = plans.filter((p) => p.id === "starter" || p.id === "team");

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head"><h1>Settings</h1></div>
      <div className="stack">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

        <form className="panel stack" onSubmit={saveBranding}>
          <h2>Organisation and branding</h2>
          <label className="field">Name
            <input id="org-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="row">
            <label className="field">Brand colour <span className="hint">Headings and tables in exports</span>
              <input id="org-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 80, height: 36 }} />
            </label>
            <div className="field">
              Logo <span className="hint">PNG or JPEG, under 1 MB</span>
              <div className="row">
                {logoUrl && <img src={logoUrl} alt="Current logo" style={{ height: 36, maxWidth: 120, objectFit: "contain" }} />}
                <input id="org-logo" type="file" accept="image/png,image/jpeg" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
              </div>
            </div>
          </div>
          <div><button className="btn">Save</button></div>
        </form>

        <div className="panel stack">
          <h2>AI usage this month</h2>
          <div className="between">
            <span><b>{fmtUsd(spent)}</b> of {fmtUsd(budget)} allowance</span>
            <span className="small muted">Resets on the 1st (UTC)</span>
          </div>
          <div className={`meter${pct > 85 ? " hot" : ""}`}><i style={{ width: `${pct}%` }} /></div>
          <div className="row small muted">
            {Object.entries(byOp).map(([op, v]) => <span key={op}>{op}: {fmtUsd(v)}</span>)}
            {!usage.length && <span>No AI calls yet this month.</span>}
          </div>
          <p className="small muted">When the allowance runs out, AI drafting pauses until the 1st; everything else keeps working.</p>
        </div>

        <div className="panel stack">
          <h2>Plan and billing</h2>
          <p>
            Current plan: <b>{plan.name}</b> · {plan.seats} seats · {plan.max_books ? `${plan.max_books} active books` : "unlimited books"} · exports: {plan.exports.join(", ").toUpperCase()}
            <br />
            <span className="small muted">Subscription status: {org.subscription_status}</span>
          </p>
          {org.subscription_status === "pilot" && (
            <Notice kind="info">You're on the pilot programme. Billing starts only when you choose a plan below.</Notice>
          )}
          {org.stripe_subscription_id ? (
            <div><button className="btn secondary" disabled={busy} onClick={() => billing("portal")}>Manage billing</button></div>
          ) : (
            <div className="row">
              {paid.map((p) => (
                <button key={p.id} className="btn secondary" disabled={busy} onClick={() => billing("checkout", p.id)}>
                  Choose {p.name} ({p.seats} seats)
                </button>
              ))}
            </div>
          )}
          <p className="small muted">Payments are handled by Stripe. Institutional licences are invoiced: contact Safety Academia.</p>
        </div>
      </div>
    </div>
  );
}
