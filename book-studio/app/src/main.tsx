import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useParams } from "react-router-dom";
import "./styles.css";
import { configured, DEMO, supabase } from "./lib/supabase";
import { resetDemo } from "./lib/demo/store";
import { SessionProvider, useSession } from "./lib/session";
import { OrgProvider, useOrg } from "./lib/org";
import { Loading } from "./components/ui";
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
  return (
    <div className="demo-banner" role="note">
      <b>Demo</b> · sample data, pre-written AI responses, nothing is shared or sent anywhere. Your changes stay in this browser.
      <button className="linkbtn" onClick={() => { resetDemo(); window.location.href = "/"; }}>Reset demo</button>
    </div>
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
