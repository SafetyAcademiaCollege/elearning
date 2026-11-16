import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/session";
import { Notice } from "../components/ui";

export default function Login() {
  const { session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "link" | "reset">("password");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  if (session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const redirect = `${window.location.origin}/welcome`;
    try {
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "link") {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` } });
        if (error) throw error;
        setMsg({ kind: "ok", text: "Check your inbox for a sign-in link." });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect });
        if (error) throw error;
        setMsg({ kind: "ok", text: "If that address has an account, a reset link is on its way." });
      }
    } catch (err) {
      const text = (err as Error).message.includes("Invalid login") ? "Email or password is wrong." : (err as Error).message;
      setMsg({ kind: "error", text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="panel" onSubmit={submit}>
        <div>
          <div className="mono small" style={{ color: "var(--signal)", letterSpacing: ".1em" }}>SAFETY ACADEMIA</div>
          <h1>Book Studio</h1>
          <p className="muted small">Write, review and approve training manuals with a full record of who wrote what.</p>
        </div>
        <label className="field">Email
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode === "password" && (
          <label className="field">Password
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button className="btn" disabled={busy}>
          {mode === "password" ? "Sign in" : mode === "link" ? "Email me a sign-in link" : "Send reset link"}
        </button>
        <div className="row small">
          {mode !== "password" && <button type="button" className="linkbtn" onClick={() => setMode("password")}>Sign in with password</button>}
          {mode !== "link" && <button type="button" className="linkbtn" onClick={() => setMode("link")}>Use a sign-in link</button>}
          {mode !== "reset" && <button type="button" className="linkbtn" onClick={() => setMode("reset")}>Forgot password</button>}
        </div>
        <p className="muted small">Access is by invitation from your organisation's Book Studio owner.</p>
      </form>
    </div>
  );
}
