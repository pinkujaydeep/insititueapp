// Staff account management. Runs server-side with the service-role key, which never reaches the browser.
// Only callers with the `users.manage` permission (Super Admin) may use it.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((o) => o.trim());
const ROLES = ["super_admin", "administrator", "accounts_staff", "admissions_staff"];
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.includes("*") || (origin && ALLOWED_ORIGINS.includes(origin));
  return {
    "Access-Control-Allow-Origin": allowed ? (origin ?? "*") : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(400, "Password must be 8-72 characters and contain letters and numbers");
  }
  return password;
}

function validateRoles(roles: unknown): string[] {
  if (!Array.isArray(roles) || roles.length === 0 || roles.some((r) => !ROLES.includes(r))) {
    throw new HttpError(400, "Select at least one valid role");
  }
  return [...new Set(roles as string[])];
}

function validateUserId(id: unknown): string {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw new HttpError(400, "Invalid user id");
  return id;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new HttpError(401, "Not signed in");

    // Verify the caller with their own token and RLS-protected permission check.
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser(authHeader.slice(7));
    if (userError || !userData.user) throw new HttpError(401, "Session expired. Please sign in again.");
    const { data: profile, error: profileError } = await caller.rpc("my_profile");
    if (profileError || !profile?.permissions?.includes("users.manage")) {
      throw new HttpError(403, "Only a Super Admin can manage staff accounts");
    }
    const actorId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const audit = (action: string, recordId: string, data: Record<string, unknown>) =>
      admin.from("audit_logs").insert({
        actor_id: actorId,
        actor_email: userData.user!.email,
        action,
        table_name: "auth.users",
        record_id: recordId,
        new_data: data,
      });

    const body = await req.json().catch(() => {
      throw new HttpError(400, "Invalid JSON body");
    });

    switch (body?.action) {
      case "create": {
        const email = String(body.email ?? "").trim().toLowerCase();
        const fullName = String(body.full_name ?? "").replace(/[<>\u0000-\u001f]/g, "").trim();
        const phone = body.phone ? String(body.phone).replace(/[^\d+\s-]/g, "").trim().slice(0, 30) : null;
        if (!EMAIL_RE.test(email) || email.length > 200) throw new HttpError(400, "Enter a valid email address");
        if (fullName.length < 2 || fullName.length > 100) throw new HttpError(400, "Enter the full name (2-100 characters)");
        const password = validatePassword(body.password);
        const roles = validateRoles(body.roles);

        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (error || !created.user) {
          throw new HttpError(error?.status === 422 ? 409 : 400, error?.message ?? "Could not create user");
        }
        const userId = created.user.id;
        const { error: insertError } = await admin
          .from("admin_users")
          .insert({ id: userId, email, full_name: fullName, phone });
        const { error: roleError } = insertError
          ? { error: insertError }
          : await admin.from("user_roles").insert(roles.map((role) => ({ user_id: userId, role, granted_by: actorId })));
        if (insertError || roleError) {
          await admin.auth.admin.deleteUser(userId);
          throw new HttpError(400, (insertError ?? roleError)!.message);
        }
        await audit("CREATE_STAFF", userId, { email, full_name: fullName, roles });
        return json({ id: userId, email, full_name: fullName, roles }, 201);
      }

      case "set_active": {
        const userId = validateUserId(body.user_id);
        if (userId === actorId) throw new HttpError(400, "You cannot deactivate your own account");
        const isActive = body.is_active === true;
        const { error } = await admin.from("admin_users").update({ is_active: isActive }).eq("id", userId);
        if (error) throw new HttpError(error.code === "PT409" ? 409 : 400, error.message);
        const { error: banError } = await admin.auth.admin.updateUserById(userId, {
          ban_duration: isActive ? "none" : "876000h",
        });
        if (banError) throw new HttpError(400, banError.message);
        await audit(isActive ? "ACTIVATE_STAFF" : "DEACTIVATE_STAFF", userId, { is_active: isActive });
        return json({ id: userId, is_active: isActive });
      }

      case "set_password": {
        const userId = validateUserId(body.user_id);
        if (userId === actorId) throw new HttpError(400, "Change your own password from Settings");
        const password = validatePassword(body.password);
        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        if (error) throw new HttpError(400, error.message);
        await audit("RESET_STAFF_PASSWORD", userId, {});
        return json({ id: userId });
      }

      default:
        throw new HttpError(400, "Unknown action");
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : "Unexpected server error";
    if (status === 500) console.error(err);
    return json({ error: message }, status);
  }
});
