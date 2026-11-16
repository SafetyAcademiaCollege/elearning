import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

interface SessionState {
  session: Session | null;
  loading: boolean;
  isPlatformAdmin: boolean;
}

const Ctx = createContext<SessionState>({ session: null, loading: true, isPlatformAdmin: false });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true, isPlatformAdmin: false });

  useEffect(() => {
    let cancelled = false;
    const apply = async (session: Session | null) => {
      let isPlatformAdmin = false;
      if (session) {
        const { data } = await supabase.rpc("is_platform_admin");
        isPlatformAdmin = data === true;
      }
      if (!cancelled) setState({ session, loading: false, isPlatformAdmin });
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Deferred: supabase-js warns against awaiting other calls inside this callback.
      setTimeout(() => apply(session), 0);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
