import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

function readStatus() {
  const out = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out.slice(out.indexOf("{"))) as Record<string, string>;
}

const status = readStatus();
export const SUPABASE_URL = status.API_URL;
export const ANON_KEY = status.ANON_KEY;
export const SERVICE_KEY = status.SERVICE_ROLE_KEY;
export const JWT_SECRET = status.JWT_SECRET;
const DB_URL = status.DB_URL;

const options = { auth: { persistSession: false, autoRefreshToken: false } };
export const anon = () => createClient(SUPABASE_URL, ANON_KEY, options);
export const service = createClient(SUPABASE_URL, SERVICE_KEY, options);

const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });
/** Direct SQL for test housekeeping only. */
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
export const closeDb = () => pool.end();

export const tag = () => randomUUID().slice(0, 8);

export type Role = "super_admin" | "administrator" | "accounts_staff" | "admissions_staff";
export interface Staff {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
}

export async function createStaff(roles: Role[], label = roles.join("-") || "noroles"): Promise<Staff> {
  const email = `${label.replace(/_/g, "-")}-${tag()}@example.com`;
  const password = `Passw0rd-${tag()}`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  const { error: e1 } = await service.from("admin_users").insert({ id, email, full_name: `Test ${label}` });
  if (e1) throw e1;
  if (roles.length) {
    const { error: e2 } = await service.from("user_roles").insert(roles.map((role) => ({ user_id: id, role })));
    if (e2) throw e2;
  }
  return { id, email, password, client: await signIn(email, password) };
}

/** An authenticated user that is NOT staff (no admin_users row). */
export async function createOutsider(): Promise<Staff> {
  const email = `outsider-${tag()}@example.com`;
  const password = `Passw0rd-${tag()}`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, email, password, client: await signIn(email, password) };
}

export async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export interface CourseOptions {
  tuition?: number;
  admission?: number;
  registration?: number;
  installments?: number;
  capacity?: number | null;
  batch?: { capacity?: number | null } | null;
  publish?: boolean;
}

/** Creates a course (and optionally a batch) directly with the service role. */
export async function createCourse(opts: CourseOptions = {}) {
  const code = `T${tag().toUpperCase().replace(/[^A-Z0-9]/g, "")}`.slice(0, 12);
  const { data: course, error } = await service
    .from("courses")
    .insert({
      code,
      title: `Test Course ${code}`,
      short_description: "A course created by the automated test suite.",
      duration_value: 3,
      duration_unit: "months",
      max_capacity: opts.capacity ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  const { error: feeError } = await service.from("fee_structures").insert({
    course_id: course.id,
    tuition_fee: opts.tuition ?? 10000,
    admission_fee: opts.admission ?? 0,
    registration_fee: opts.registration ?? 0,
    installment_count: opts.installments ?? 1,
  });
  if (feeError) throw feeError;
  let batchId: string | null = null;
  if (opts.batch) {
    const start = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const { data: batch, error: batchError } = await service
      .from("batches")
      .insert({ course_id: course.id, name: "Test Batch", start_date: start, capacity: opts.batch.capacity ?? null })
      .select()
      .single();
    if (batchError) throw batchError;
    batchId = batch.id;
  }
  if (opts.publish !== false) {
    const { error: pubError } = await service.from("courses").update({ status: "published" }).eq("id", course.id);
    if (pubError) throw pubError;
  }
  return { id: course.id as string, code, batchId };
}

export function registrationPayload(courseId: string, overrides: Record<string, unknown> = {}) {
  return {
    p_full_name: "Asha Verma",
    p_email: `asha-${tag()}@example.com`,
    p_mobile: "9876543210",
    p_city: "Pune",
    p_state: "Maharashtra",
    p_postal_code: "411001",
    p_highest_qualification: "B.Com",
    p_course_id: courseId,
    p_privacy_consent: true,
    p_client_token: randomUUID(),
    ...overrides,
  };
}

export async function clearRateLimits() {
  await sql("delete from private.registration_attempts");
}

/** Registers via the public RPC as an anonymous visitor. */
export async function register(courseId: string, overrides: Record<string, unknown> = {}) {
  await clearRateLimits();
  return anon().rpc("submit_registration", registrationPayload(courseId, overrides));
}

export async function enrollmentByRegNo(regNo: string) {
  const { data, error } = await service.from("student_enrollments").select("*").eq("registration_no", regNo).single();
  if (error) throw error;
  return data;
}

/** Registers a student and moves the enrollment to the given status. Returns the enrollment row. */
export async function registeredEnrollment(courseId: string, status = "approved", overrides: Record<string, unknown> = {}) {
  const { data, error } = await register(courseId, overrides);
  if (error) throw error;
  const enrollment = await enrollmentByRegNo(data.registration_no);
  if (status !== "new_enquiry") {
    await sql("update public.student_enrollments set status = $1 where id = $2", [status, enrollment.id]);
  }
  return { ...enrollment, status };
}

/** Fee-aware view of an enrollment; requires a client with fees.read (the service role has no staff identity). */
export async function overview(client: SupabaseClient, id: string) {
  const { data, error } = await client.from("enrollment_overview").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

/** Date offset from the institute's "today" (database time zone), as YYYY-MM-DD. */
export async function dbDate(offsetDays = 0): Promise<string> {
  const rows = await sql<{ d: string }>("select to_char(private.today() + $1::int, 'YYYY-MM-DD') as d", [offsetDays]);
  return rows[0].d;
}

export const newKey = () => randomUUID();
