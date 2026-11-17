import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDemoClient } from "./demo/client";

/** Demo builds (VITE_DEMO=true) run entirely in the browser with sample data. */
export const DEMO = import.meta.env.VITE_DEMO === "true";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = DEMO || Boolean(url && key);

export const supabase: SupabaseClient = DEMO
  ? (createDemoClient() as SupabaseClient)
  : createClient(url ?? "http://localhost:54321", key ?? "missing-key", {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

export const functionsUrl = `${url ?? ""}/functions/v1`;
