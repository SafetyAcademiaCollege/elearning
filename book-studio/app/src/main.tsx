import { StrictMode, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useParams } from "react-router-dom";
import "./styles.css";
import { configured, DEMO, supabase } from "./lib/supabase";
import { resetDemo } from "./lib/demo/store";
import { liveCode, setLiveCode, verifyCode } from "./lib/demo/live";
import { SessionProvider, useSession } from "./lib/session";
import { OrgProvider, useOrg } from "./lib/org";
import { Dialog, Loading, Notice } from "./components/ui";
import Login from "./pages/Login";
import Welcome from "./pages/Welcome";
import Home from "./pages/Home";
import Books from "./pages/Books";
import Studio from "./pages/Studio";
import Library from "./pages/Library";
import Team from "./pages/Team";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";

function RequireAuth() {
  const { session, loading } = useSession();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function OrgShell() {
  const { orgId } = useParams();
  return (
    <OrgProvider orgId={orgId!} fallback={<Loading />}>
      <TopBar />
      <Outlet />
    </OrgProvider>
  );
}

function TopBar() {
  const { org, logoUrl, can } = useOrg();
  const { isPlatformAdmin } = useSession();
  const base = `/o/${org.id}`;
  return (
    <header className="topbar">
      <NavLink to={base} className="brand" end>
        {logoUrl ? <img src={logoUrl} alt="" /> : null}
        <span>
          <span className="kicker">Book Studio</span>
          <br />
          {org.name}
        </span>
      </NavLink>
      <nav className="nav" aria-label="Main">
        <NavLink to={base} end>Books</NavLink>
        <NavLink to={`${base}/library`}>Sources & glossary</NavLink>
        <NavLink to={`${base}/team`}>Team</NavLink>
        {can("owner") && <NavLink to={`${base}/settings`}>Settings</NavLink>}
        {isPlatformAdmin && <NavLink to="/admin">Admin</NavLink>}
      </nav>
      <span className="spacer" />
      <NavLink to="/" className="small">Switch organisation</NavLink>
      <button className="btn ghost small" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </header>
  );
}

function DemoBanner() {
  const [live, setLive] = useState(() => !!liveCode());
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    const on = () => setLive(!!liveCode());
    window.addEventListener("book-studio-live-ai", on);
    return () => window.removeEventListener("book-studio-live-ai", on);
  }, []);
  return (
    <div className="demo-banner" role="note">
      <b>Demo</b>
      <span>Sample data stays in this browser. AI: {live ? <b>live (Claude)</b> : "pre-written samples"}.</span>
      {live
        ? <button className="linkbtn" onClick={() => setLiveCode(null)}>Switch to sample AI</button>
        : <button className="linkbtn" onClick={() => setAsking(true)}>Use live AI</button>}
      <button className="linkbtn" onClick={() => { resetDemo(); window.location.href = "/"; }}>Reset demo</button>
      {asking && <LiveCodeDialog onClose={() => setAsking(false)} />}
    </div>
  );
}

function LiveCodeDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await verifyCode(code.trim());
    setBusy(false);
    if (err) setError(err);
    else {
      setLiveCode(code.trim());
      onClose();
    }
  }
  return (
    <Dialog title="Use live AI" onClose={onClose}>
      <form className="stack" onSubmit={submit} style={{ color: "var(--ink)" }}>
        <p className="small" style={{ margin: 0 }}>
          Live AI sends the chapter you're working on to Claude and costs real money, so it needs the access code from Safety Academia. Your book still stays in this browser.
        </p>
        <label className="field">Access code
          <input id="live-code" type="password" autoComplete="off" required value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        </label>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Switch on"}</button>
        </div>
      </form>
    </Dialog>
  );
}

function NotConfigured() {
  return (
    <div className="auth">
      <div className="panel">
        <h1>Book Studio</h1>
        <p>This build has no Supabase project configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> and rebuild. See the deployment guide in the repository.</p>
      </div>
    </div>
  );
}

function App() {
  if (!configured) return <NotConfigured />;
  return (
    <SessionProvider>
      {DEMO && <DemoBanner />}
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/" element={<Home />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/o/:orgId" element={<OrgShell />}>
              <Route index element={<Books />} />
              <Route path="b/:bookId" element={<Studio />} />
              <Route path="library" element={<Library />} />
              <Route path="team" element={<Team />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
