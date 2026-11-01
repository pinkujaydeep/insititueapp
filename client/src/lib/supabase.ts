import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Only the public anon/publishable key is used in the browser; all access is governed by RLS.
export const supabase = createClient<Database>(url || "http://localhost:54321", anonKey || "missing-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const PUBLIC_BUCKET = "public-assets";

export function publicAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
}
