import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anon, closeDb, createCourse, createOutsider, createStaff, dbDate, newKey, overview, registeredEnrollment, service,
  type Staff,
} from "./helpers";

const PRIVATE_TABLES = [
  "students", "student_enrollments", "fee_installments", "fee_payments", "payment_receipts",
  "admission_notes", "audit_logs", "admin_users", "user_roles", "notification_outbox",
  "enrollment_overview", "payment_ledger",
];

let superAdmin: Staff, administrator: Staff, accounts: Staff, admissions: Staff, outsider: Staff;
let course: Awaited<ReturnType<typeof createCourse>>;
let enrollment: { id: string; registration_no: string };
let today: string;

beforeAll(async () => {
  [superAdmin, administrator, accounts, admissions, outsider] = await Promise.all([
    createStaff(["super_admin"]),
    createStaff(["administrator"]),
    createStaff(["accounts_staff"]),
    createStaff(["admissions_staff"]),
    createOutsider(),
  ]);
  course = await createCourse({ tuition: 9000 });
  enrollment = await registeredEnrollment(course.id, "approved");
  today = await dbDate();
  const { error } = await accounts.client.rpc("record_payment", {
    p_enrollment_id: enrollment.id, p_amount: 1000, p_method: "cash", p_payment_date: today, p_idempotency_key: newKey(),
  });
  if (error) throw error;
});
afterAll(closeDb);

const pay = (s: Staff) =>
  s.client.rpc("record_payment", {
    p_enrollment_id: enrollment.id, p_amount: 1, p_method: "cash", p_payment_date: today, p_idempotency_key: newKey(),
  });

describe("anonymous visitors", () => {
  it.each(PRIVATE_TABLES)("cannot read %s", async (table) => {
    const { data, error } = await anon().from(table).select("*").limit(1);
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("cannot insert or modify student records directly", async () => {
    const insert = await anon().from("students").insert({ full_name: "x" });
    expect(insert.error?.code).toBe("42501");
    const update = await anon().from("student_enrollments").update({ status: "enrolled" }).eq("id", enrollment.id);
    expect(update.error?.code).toBe("42501");
    const courseUpdate = await anon().from("courses").update({ title: "Hacked" }).eq("id", course.id);
    expect(courseUpdate.error?.code).toBe("42501");
  });

  it("only sees published courses", async () => {
    const draft = await createCourse({ publish: false });
    const { data } = await anon().from("courses").select("id, status");
    expect(data!.every((c) => c.status === "published")).toBe(true);
    expect(data!.some((c) => c.id === draft.id)).toBe(false);
  });

  it.each([
    ["record_payment", { p_enrollment_id: "00000000-0000-0000-0000-000000000000", p_amount: 1, p_method: "cash", p_payment_date: "2026-01-01", p_idempotency_key: "00000000-0000-0000-0000-000000000000" }],
    ["dashboard_summary", {}],
    ["report_outstanding", {}],
    ["update_enrollment_status", { p_enrollment_id: "00000000-0000-0000-0000-000000000000", p_status: "enrolled" }],
  ])("cannot call %s", async (fn, args) => {
    const { error } = await anon().rpc(fn, args);
    expect(error?.code).toBe("42501");
  });
});

describe("signed-in users who are not staff", () => {
  it("see no student or payment rows", async () => {
    for (const table of ["students", "student_enrollments", "fee_payments"]) {
      const { data, error } = await outsider.client.from(table).select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("cannot record payments or read reports", async () => {
    expect((await pay(outsider)).error?.code).toBe("42501");
    expect((await outsider.client.rpc("dashboard_summary", {})).error?.code).toBe("42501");
  });

  it("cannot grant themselves a role", async () => {
    const { error } = await outsider.client.from("user_roles").insert({ user_id: outsider.id, role: "super_admin", granted_by: outsider.id });
    expect(error).not.toBeNull();
  });
});

describe("admissions staff", () => {
  it("can view applications and update admission status", async () => {
    const { data } = await admissions.client.from("student_enrollments").select("id").eq("id", enrollment.id);
    expect(data).toHaveLength(1);
    const e2 = await registeredEnrollment(course.id, "new_enquiry");
    const { error } = await admissions.client.rpc("update_enrollment_status", { p_enrollment_id: e2.id, p_status: "contacted", p_note: "Called student" });
    expect(error).toBeNull();
  });

  it("cannot read or modify financial records", async () => {
    expect((await admissions.client.from("fee_payments").select("id")).data).toEqual([]);
    expect((await admissions.client.from("payment_receipts").select("id")).data).toEqual([]);
    expect((await pay(admissions)).error?.code).toBe("42501");
    const feeChange = await admissions.client.rpc("update_enrollment_fees", {
      p_enrollment_id: enrollment.id, p_tuition_fee: 1, p_admission_fee: 0, p_registration_fee: 0,
      p_additional_charges: 0, p_discount: 0, p_scholarship: 0, p_installment_count: 1, p_first_due_date: today,
    });
    expect(feeChange.error?.code).toBe("42501");
    expect((await admissions.client.rpc("report_outstanding", {})).error?.code).toBe("42501");
    const row = await overview(admissions.client, enrollment.id);
    expect(row.total_fee).toBeNull();
    expect(row.balance).toBeNull();
  });

  it("gets a dashboard without financial figures", async () => {
    const { data, error } = await admissions.client.rpc("dashboard_summary", {});
    expect(error).toBeNull();
    expect(data.can_view_fees).toBe(false);
    expect(data.cards.fees_collected).toBeNull();
    expect(data.monthly_collections).toBeNull();
  });
});

describe("accounts staff", () => {
  it("can view students and record payments", async () => {
    expect((await accounts.client.from("students").select("id").limit(1)).data).toHaveLength(1);
    expect((await pay(accounts)).error).toBeNull();
  });

  it("cannot manage staff accounts or roles", async () => {
    const { error } = await accounts.client.from("user_roles").insert({ user_id: admissions.id, role: "super_admin", granted_by: accounts.id });
    expect(error?.code).toBe("42501");
    const self = await accounts.client.from("user_roles").insert({ user_id: accounts.id, role: "super_admin", granted_by: accounts.id });
    expect(self.error?.code).toBe("42501");
  });

  it("cannot change admission status, courses, refunds or voids", async () => {
    expect((await accounts.client.rpc("update_enrollment_status", { p_enrollment_id: enrollment.id, p_status: "enrolled" })).error?.code).toBe("42501");
    const upd = await accounts.client.from("courses").update({ title: "Changed by accounts" }).eq("id", course.id).select();
    expect(upd.data ?? []).toEqual([]);
    const refund = await accounts.client.rpc("record_refund", {
      p_enrollment_id: enrollment.id, p_amount: 1, p_method: "cash", p_payment_date: today, p_idempotency_key: newKey(), p_remarks: "test refund",
    });
    expect(refund.error?.code).toBe("42501");
  });
});

describe("administrators", () => {
  it("can view payments but not record them", async () => {
    expect((await administrator.client.from("fee_payments").select("id").eq("enrollment_id", enrollment.id)).data!.length).toBeGreaterThan(0);
    expect((await pay(administrator)).error?.code).toBe("42501");
  });

  it("cannot manage users", async () => {
    const { error } = await administrator.client.from("user_roles").insert({ user_id: admissions.id, role: "administrator", granted_by: administrator.id });
    expect(error?.code).toBe("42501");
  });
});

describe("super admin", () => {
  it("can grant and revoke roles for other staff", async () => {
    const target = await createStaff([]);
    const grant = await superAdmin.client.from("user_roles").insert({ user_id: target.id, role: "accounts_staff", granted_by: superAdmin.id });
    expect(grant.error).toBeNull();
    const revoke = await superAdmin.client.from("user_roles").delete().eq("user_id", target.id).eq("role", "accounts_staff").select();
    expect(revoke.data).toHaveLength(1);
  });

  it("cannot change their own roles", async () => {
    const add = await superAdmin.client.from("user_roles").insert({ user_id: superAdmin.id, role: "administrator", granted_by: superAdmin.id });
    expect(add.error?.code).toBe("42501");
    const remove = await superAdmin.client.from("user_roles").delete().eq("user_id", superAdmin.id).select();
    expect(remove.data).toEqual([]);
  });

  it("cannot edit or delete payment records directly", async () => {
    const upd = await superAdmin.client.from("fee_payments").update({ amount: 1 }).eq("enrollment_id", enrollment.id);
    expect(upd.error?.code).toBe("42501");
    const del = await superAdmin.client.from("fee_payments").delete().eq("enrollment_id", enrollment.id);
    expect(del.error?.code).toBe("42501");
    const svc = await service.from("fee_payments").update({ amount: 1 }).eq("enrollment_id", enrollment.id);
    expect(svc.error?.code).toBe("42501");
  });
});

describe("deactivated staff", () => {
  it("lose access immediately", async () => {
    const temp = await createStaff(["accounts_staff"]);
    expect((await temp.client.from("students").select("id").limit(1)).data).toHaveLength(1);
    await service.from("admin_users").update({ is_active: false }).eq("id", temp.id);
    expect((await temp.client.from("students").select("id")).data).toEqual([]);
    expect((await temp.client.rpc("my_profile")).data.permissions).toEqual([]);
  });
});
