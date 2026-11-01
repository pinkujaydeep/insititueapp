import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANON_KEY, JWT_SECRET, SUPABASE_URL, anon, closeDb, createStaff, signIn, type Staff } from "./helpers";

let superAdmin: Staff, accounts: Staff;

beforeAll(async () => {
  [superAdmin, accounts] = await Promise.all([createStaff(["super_admin"]), createStaff(["accounts_staff"])]);
});
afterAll(closeDb);

function signJwt(payload: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
  return `${body}.${createHmac("sha256", JWT_SECRET).update(body).digest("base64url")}`;
}

describe("authentication", () => {
  it("signs in with valid credentials and loads roles and permissions", async () => {
    const client = await signIn(accounts.email, accounts.password);
    const { data } = await client.rpc("my_profile");
    expect(data.roles).toEqual(["accounts_staff"]);
    expect(data.permissions).toContain("payments.record");
    expect(data.permissions).not.toContain("users.manage");
  });

  it("rejects an invalid password", async () => {
    const { data, error } = await anon().auth.signInWithPassword({ email: accounts.email, password: "wrong-password-1" });
    expect(data.session).toBeNull();
    expect(error).not.toBeNull();
  });

  it("does not allow public self sign-up", async () => {
    const { error } = await anon().auth.signUp({ email: `self-${Date.now()}@example.com`, password: "Passw0rd-123" });
    expect(error).not.toBeNull();
  });

  it("rejects expired sessions", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = signJwt({ sub: accounts.id, role: "authenticated", aud: "authenticated", iat: now - 7200, exp: now - 3600 });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/students?select=id`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${expired}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects tokens signed with the wrong secret", async () => {
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: accounts.id, role: "authenticated", exp: now + 3600 })}`;
    const forged = `${body}.${createHmac("sha256", "not-the-secret").update(body).digest("base64url")}`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/students?select=id`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${forged}` },
    });
    expect(res.status).toBe(401);
  });

  it("ends the session on logout", async () => {
    const user = await createStaff(["admissions_staff"]);
    const client = await signIn(user.email, user.password);
    await client.auth.signOut();
    const { data } = await client.auth.getSession();
    expect(data.session).toBeNull();
    const { data: profile } = await client.rpc("my_profile");
    expect(profile).toBeNull();
  });
});

describe("staff account management (admin-users edge function)", () => {
  const invoke = (s: Staff, body: Record<string, unknown>) => s.client.functions.invoke("admin-users", { body });

  it("lets a Super Admin create a staff account with roles", async () => {
    const email = `new-staff-${Date.now()}@example.com`;
    const { data, error } = await invoke(superAdmin, {
      action: "create", email, full_name: "New Staff", password: "Welcome123", roles: ["admissions_staff"],
    });
    expect(error).toBeNull();
    const client = await signIn(email, "Welcome123");
    const { data: profile } = await client.rpc("my_profile");
    expect(profile.roles).toEqual(["admissions_staff"]);

    const deactivate = await invoke(superAdmin, { action: "set_active", user_id: data.id, is_active: false });
    expect(deactivate.error).toBeNull();
    const { error: loginError } = await anon().auth.signInWithPassword({ email, password: "Welcome123" });
    expect(loginError).not.toBeNull();
  });

  it("refuses requests from non-Super Admins", async () => {
    const { error } = await invoke(accounts, {
      action: "create", email: `x-${Date.now()}@example.com`, full_name: "X", password: "Welcome123", roles: ["super_admin"],
    });
    expect(error).not.toBeNull();
    expect((error as { context?: Response }).context?.status).toBe(403);
  });

  it("validates input", async () => {
    const weak = await invoke(superAdmin, { action: "create", email: `w-${Date.now()}@example.com`, full_name: "Weak", password: "short", roles: ["accounts_staff"] });
    expect((weak.error as { context?: Response }).context?.status).toBe(400);
    const self = await invoke(superAdmin, { action: "set_active", user_id: superAdmin.id, is_active: false });
    expect((self.error as { context?: Response }).context?.status).toBe(400);
  });
});
