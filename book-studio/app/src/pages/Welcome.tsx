import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/session";
import { Notice } from "../components/ui";

/** Landing page after an invitation or password-reset link: set name and password. */
export default function Welcome() {
  const { session } = useSession();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase.from("profiles").select("full_name").eq("id", session.user.id).maybeSingle().then(({ data }) => setName(data?.full_name ?? ""));
  }, [session]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: pwErr } = await supabase.auth.updateUser({ password });
    if (pwErr) {
      setError(pwErr.message);
      setBusy(false);
      return;
    }
    if (session) await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", session.user.id);
    nav("/", { replace: true });
  }

  return (
    <div className="auth">
      <form className="panel" onSubmit={submit}>
        <h1>Welcome to Book Studio</h1>
        <p className="muted small">Set your name and a password. You'll use them to sign in from now on.</p>
        <label className="field">Your name
          <span className="hint">Shown to colleagues on reviews and in the audit log.</span>
          <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">New password
          <input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn" disabled={busy}>Save and continue</button>
      </form>
    </div>
  );
}
