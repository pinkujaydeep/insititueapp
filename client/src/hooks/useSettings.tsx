import { createContext, useContext, useEffect, type ReactNode } from "react";
import { setCurrency } from "../lib/format";
import { publicAssetUrl, supabase } from "../lib/supabase";
import { unwrap } from "../lib/errors";
import type { InstituteSettings } from "../lib/types";
import { useQuery } from "./useQuery";

interface SettingsContextValue {
  settings: InstituteSettings | undefined;
  logoUrl: string | null;
  loading: boolean;
  reload: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data, loading, reload } = useQuery(
    () => unwrap(supabase.from("institute_settings").select("*").eq("id", 1).single()),
    [],
  );

  useEffect(() => {
    if (!data) return;
    setCurrency(data.currency);
    document.title = data.tagline ? `${data.institute_name} - ${data.tagline}` : data.institute_name;
  }, [data]);

  return (
    <SettingsContext.Provider value={{ settings: data, logoUrl: publicAssetUrl(data?.logo_path), loading, reload }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
