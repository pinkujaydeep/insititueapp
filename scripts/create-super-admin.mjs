#!/usr/bin/env node
// Creates (or promotes) the first Super Admin. Run from a trusted machine only.
//
// Production:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//   SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_NAME="Your Name" SUPER_ADMIN_PASSWORD=... \
//   node scripts/create-super-admin.mjs
//
// Local dev (reads URL/key from `supabase status`):
//   SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... node scripts/create-super-admin.mjs --local
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function localStatus() {
  const out = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out.slice(out.indexOf("{")));
}

const local = process.argv.includes("--local");
let url = process.env.SUPABASE_URL;
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (local) {
  const status = localStatus();
  url = status.API_URL;
  serviceKey = status.SERVICE_ROLE_KEY;
}

const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.SUPER_ADMIN_NAME?.trim() || "Super Admin";
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --local).");
  process.exit(1);
}
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Set SUPER_ADMIN_EMAIL to a valid email address.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserByEmail(target) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === target);
    if (user || data.users.length < 200) return user;
  }
  return undefined;
}

let user = await findUserByEmail(email);
if (!user) {
  if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    console.error("Set SUPER_ADMIN_PASSWORD (8+ characters with letters and numbers) to create a new account.");
    process.exit(1);
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) throw error;
  user = data.user;
  console.log(`Created auth user ${email}`);
} else {
  console.log(`Auth user ${email} already exists; granting Super Admin.`);
}

const { error: upsertError } = await admin
  .from("admin_users")
  .upsert({ id: user.id, email, full_name: name, is_active: true }, { onConflict: "id" });
if (upsertError) throw upsertError;

const { error: roleError } = await admin
  .from("user_roles")
  .upsert({ user_id: user.id, role: "super_admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
if (roleError) throw roleError;

console.log(`${email} is now a Super Admin. Sign in at /admin/login.`);
