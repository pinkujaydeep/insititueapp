import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { supabase } from "../lib/supabase";
import type { Permission, StaffProfile } from "../lib/types";
import { PageLoader } from "../components/ui/Feedback";

interface AuthContextValue {
  session: Session | null;
  profile: StaffProfile | null;
  loading: boolean;
  can: (permission: Permission) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(): Promise<StaffProfile | null> {
  const { data, error } = await supabase.rpc("my_profile");
  if (error) throw error;
  return (data as unknown as StaffProfile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await loadProfile());
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) await refreshProfile();
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") navigate("/admin/reset-password", { replace: true });
      if (event === "SIGNED_OUT") setProfile(null);
      // Defer RPC calls out of the auth callback to avoid deadlocking the auth client.
      if (event === "SIGNED_IN" || event === "USER_UPDATED") setTimeout(() => void refreshProfile(), 0);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate, refreshProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw new Error(error.message === "Invalid login credentials" ? "Incorrect email or password" : error.message);
    const p = await loadProfile();
    if (!p || !p.is_active || p.roles.length === 0) {
      await supabase.auth.signOut({ scope: "local" });
      throw new Error("This account does not have access to the admin portal. Contact your Super Admin.");
    }
    setProfile(p);
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: "local" });
    setProfile(null);
    navigate("/admin/login", { replace: true });
  };

  const can = useCallback((permission: Permission) => Boolean(profile?.permissions.includes(permission)), [profile]);

  return (
    <AuthContext.Provider value={{ session, profile, loading, can, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Guards admin routes. Real enforcement is RLS in the database; this only controls navigation. */
export function RequireStaff({ children, permission }: { children: ReactNode; permission?: Permission }) {
  const { session, profile, loading, can } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!session || !profile || profile.roles.length === 0) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  if (permission && !can(permission)) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
