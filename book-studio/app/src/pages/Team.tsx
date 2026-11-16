import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useOrg } from "../lib/org";
import { useSession } from "../lib/session";
import { callFunction, errorMessage } from "../lib/api";
import { fmtDate } from "../lib/format";
import { Loading, Notice } from "../components/ui";
import { ROLES, type Membership, type Role } from "../lib/types";

const ROLE_HELP: Record<Role, string> = {
  owner: "Manages team, settings and billing; holds every other role",
  author: "Writes chapters, manages sources and runs the AI",
  reviewer: "Accepts chapters or sends them back with changes",
  approver: "Approves reviewed chapters and opens new revisions",
};

export default function Team() {
  const { org, plan, can } = useOrg();
  const { session } = useSession();
  const [rows, setRows] = useState<Membership[] | null>(null);
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<Role[]>(["author"]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const isOwner = can("owner");

  const load = useCallback(async () => {
    const { data } = await supabase.from("memberships").select("*, profiles(email, full_name)").eq("org_id", org.id).order("created_at");
    setRows((data ?? []) as unknown as Membership[]);
  }, [org.id]);
  useEffect(() => { load(); }, [load]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await callFunction<{ invited: boolean }>("team", { op: "invite", org_id: org.id, email, roles });
      setMsg({ kind: "ok", text: r.invited ? `Invitation sent to ${email}.` : `${email} already had an account and now has access.` });
      setEmail("");
      load();
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function toggleRole(m: Membership, r: Role) {
    const next = m.roles.includes(r) ? m.roles.filter((x) => x !== r) : [...m.roles, r];
    if (!next.length) return;
    if (m.user_id === session?.user.id && r === "owner") {
      setMsg({ kind: "error", text: "You can't remove your own owner role. Ask another owner to do it." });
      return;
    }
    const { error } = await supabase.from("memberships").update({ roles: next }).eq("org_id", org.id).eq("user_id", m.user_id);
    if (error) setMsg({ kind: "error", text: errorMessage(error) });
    load();
  }

  async function remove(m: Membership) {
    const { error } = await supabase.from("memberships").delete().eq("org_id", org.id).eq("user_id", m.user_id);
    if (error) setMsg({ kind: "error", text: errorMessage(error) });
    load();
  }

  if (!rows) return <Loading />;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p className="muted small">{rows.length} of {plan.seats} seats used on the {plan.name} plan.</p>
        </div>
      </div>
      <div className="stack">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="panel table-wrap">
          <table className="list">
            <thead>
              <tr><th>Person</th>{ROLES.map((r) => <th key={r} title={ROLE_HELP[r]}>{r}</th>)}<th>Joined</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.user_id}>
                  <td>
                    <div>{m.profiles?.full_name || m.profiles?.email || "Invited user"}</div>
                    <div className="small muted">{m.profiles?.email}</div>
                  </td>
                  {ROLES.map((r) => (
                    <td key={r}>
                      <input
                        type="checkbox"
                        aria-label={`${r} role`}
                        checked={m.roles.includes(r)}
                        disabled={!isOwner}
                        onChange={() => toggleRole(m, r)}
                      />
                    </td>
                  ))}
                  <td className="small">{fmtDate(m.created_at)}</td>
                  <td>{isOwner && m.user_id !== session?.user.id && <button className="linkbtn" onClick={() => remove(m)}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel small">
          <h2>Roles</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {ROLES.map((r) => <li key={r}><b>{r}</b>: {ROLE_HELP[r]}</li>)}
          </ul>
        </div>
        {isOwner && (
          <form className="panel stack" onSubmit={invite}>
            <h2>Invite someone</h2>
            <label className="field">Email
              <input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <div className="row">
              {ROLES.map((r) => (
                <label key={r} className="check">
                  <input type="checkbox" checked={roles.includes(r)} onChange={() => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])} /> {r}
                </label>
              ))}
            </div>
            <div><button className="btn" disabled={busy || !roles.length || rows.length >= plan.seats}>Send invitation</button></div>
            {rows.length >= plan.seats && <p className="small muted">All seats are taken. Remove someone or upgrade the plan.</p>}
          </form>
        )}
      </div>
    </div>
  );
}
