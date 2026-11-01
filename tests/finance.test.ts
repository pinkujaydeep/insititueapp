import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDb, createCourse, createStaff, dbDate, newKey, overview, registeredEnrollment, service, type Staff,
} from "./helpers";

let superAdmin: Staff, accounts: Staff, administrator: Staff;
let today: string;

beforeAll(async () => {
  [superAdmin, accounts, administrator] = await Promise.all([
    createStaff(["super_admin"]),
    createStaff(["accounts_staff"]),
    createStaff(["administrator"]),
  ]);
  today = await dbDate();
});
afterAll(closeDb);

function payment(enrollmentId: string, amount: number | string, extra: Record<string, unknown> = {}) {
  return accounts.client.rpc("record_payment", {
    p_enrollment_id: enrollmentId,
    p_amount: amount,
    p_method: "cash",
    p_payment_date: today,
    p_idempotency_key: newKey(),
    ...extra,
  });
}

describe("fee collection", () => {
  it("records a full payment and issues a receipt with balances", async () => {
    const course = await createCourse({ tuition: 5000, registration: 500 });
    const e = await registeredEnrollment(course.id);
    const { data: receipt, error } = await payment(e.id, "5500.00", { p_method: "upi", p_transaction_reference: `UPI${newKey().slice(0, 10)}` });
    expect(error).toBeNull();
    expect(receipt.receipt_no).toMatch(/^RCT-\d{4}-\d{5}$/);
    expect(Number(receipt.previous_balance)).toBe(5500);
    expect(Number(receipt.remaining_balance)).toBe(0);
    expect(receipt.registration_no).toBe(e.registration_no);
    const row = await overview(accounts.client, e.id);
    expect(Number(row.balance)).toBe(0);
    expect(row.payment_status).toBe("paid");
  });

  it("supports partial payments across multiple installments", async () => {
    const course = await createCourse({ tuition: 10000, installments: 3 });
    const e = await registeredEnrollment(course.id);
    const { data: inst } = await service.from("fee_installments").select("amount").eq("enrollment_id", e.id).order("installment_no");
    expect(inst!.map((i) => Number(i.amount))).toEqual([3333.33, 3333.33, 3333.34]);

    expect((await payment(e.id, 2000)).error).toBeNull();
    let row = await overview(accounts.client, e.id);
    expect(row.payment_status).toBe("partially_paid");
    expect(Number(row.balance)).toBe(8000);
    expect(row.next_installment_no).toBe(1);
    expect(Number(row.next_due_amount)).toBe(1333.33);

    expect((await payment(e.id, "1333.33")).error).toBeNull();
    row = await overview(accounts.client, e.id);
    expect(row.next_installment_no).toBe(2);
    expect(Number(row.next_due_amount)).toBe(3333.33);

    expect((await payment(e.id, "6666.67")).error).toBeNull();
    row = await overview(accounts.client, e.id);
    expect(Number(row.balance)).toBe(0);
    expect(row.next_installment_no).toBeNull();
  });

  it("calculates exact decimal balances (no floating point drift)", async () => {
    const course = await createCourse({ tuition: 0.3 });
    const e = await registeredEnrollment(course.id);
    await payment(e.id, "0.1");
    await payment(e.id, "0.2");
    const row = await overview(accounts.client, e.id);
    expect(row.balance).toBe(0);
    expect(row.payment_status).toBe("paid");
  });

  it("rejects payments greater than the outstanding amount", async () => {
    const course = await createCourse({ tuition: 1000 });
    const e = await registeredEnrollment(course.id);
    const { error } = await payment(e.id, 1000.01);
    expect(error?.hint).toBe("amount");
    expect(error?.message).toMatch(/exceeds the outstanding balance/);
  });

  it("rejects invalid amounts, future dates and missing references", async () => {
    const course = await createCourse({ tuition: 1000 });
    const e = await registeredEnrollment(course.id);
    expect((await payment(e.id, 0)).error?.hint).toBe("amount");
    expect((await payment(e.id, -5)).error?.hint).toBe("amount");
    expect((await payment(e.id, "10.005")).error?.hint).toBe("amount");
    expect((await payment(e.id, 10, { p_payment_date: await dbDate(1) })).error?.hint).toBe("payment_date");
    expect((await payment(e.id, 10, { p_method: "upi" })).error?.hint).toBe("transaction_reference");
  });

  it("prevents duplicate payments (same request key or same transaction reference)", async () => {
    const course = await createCourse({ tuition: 3000 });
    const e = await registeredEnrollment(course.id);
    const key = newKey();
    const first = await payment(e.id, 500, { p_idempotency_key: key });
    const retry = await payment(e.id, 500, { p_idempotency_key: key });
    expect(retry.data.receipt_no).toBe(first.data.receipt_no);
    expect(retry.data.replayed).toBe(true);
    const { data: rows } = await service.from("fee_payments").select("id").eq("enrollment_id", e.id);
    expect(rows).toHaveLength(1);

    const ref = `TXN-${newKey().slice(0, 8)}`;
    expect((await payment(e.id, 100, { p_method: "bank_transfer", p_transaction_reference: ref })).error).toBeNull();
    const dup = await payment(e.id, 100, { p_method: "bank_transfer", p_transaction_reference: ref.toLowerCase() });
    expect(dup.error?.code).toBe("PT409");
  });

  it("does not accept payments for rejected registrations", async () => {
    const course = await createCourse({ tuition: 1000 });
    const e = await registeredEnrollment(course.id, "rejected");
    expect((await payment(e.id, 100)).error).not.toBeNull();
  });
});

describe("overdue tracking", () => {
  it("flags approved enrollments with past-due installments", async () => {
    const course = await createCourse({ tuition: 6000 });
    const e = await registeredEnrollment(course.id);
    const plan = await administrator.client.rpc("save_installment_plan", {
      p_enrollment_id: e.id,
      p_installments: [
        { due_date: await dbDate(-40), amount: 2000 },
        { due_date: await dbDate(-10), amount: 2000 },
        { due_date: await dbDate(20), amount: 2000 },
      ],
    });
    expect(plan.error).toBeNull();
    await payment(e.id, 1500);
    const row = await overview(accounts.client, e.id);
    expect(row.payment_status).toBe("overdue");
    expect(Number(row.overdue_amount)).toBe(2500);

    const { data: report } = await accounts.client.rpc("report_outstanding", { p_overdue_only: true });
    const line = report.find((r: { enrollment_id: string }) => r.enrollment_id === e.id);
    expect(line.days_overdue).toBe(40);
    expect(Number(line.overdue_amount)).toBe(2500);
  });

  it("does not flag enquiries that are not yet approved", async () => {
    const course = await createCourse({ tuition: 1000 });
    const e = await registeredEnrollment(course.id, "new_enquiry");
    await administrator.client.rpc("save_installment_plan", {
      p_enrollment_id: e.id, p_installments: [{ due_date: await dbDate(-5), amount: 1000 }],
    });
    expect((await overview(accounts.client, e.id)).payment_status).toBe("pending");
  });

  it("rejects an installment plan that does not add up to the total fee", async () => {
    const course = await createCourse({ tuition: 1000 });
    const e = await registeredEnrollment(course.id);
    const { error } = await administrator.client.rpc("save_installment_plan", {
      p_enrollment_id: e.id, p_installments: [{ due_date: today, amount: 999 }],
    });
    expect(error?.message).toMatch(/add up/);
  });
});

describe("fee adjustments, refunds and voids", () => {
  it("applies discount and scholarship but never below the amount already paid", async () => {
    const course = await createCourse({ tuition: 10000 });
    const e = await registeredEnrollment(course.id);
    await payment(e.id, 4000);
    const args = {
      p_enrollment_id: e.id, p_tuition_fee: 10000, p_admission_fee: 0, p_registration_fee: 0, p_additional_charges: 500,
      p_discount: 1000, p_scholarship: 2000, p_installment_count: 2, p_first_due_date: today,
    };
    expect((await administrator.client.rpc("update_enrollment_fees", args)).error).toBeNull();
    let row = await overview(accounts.client, e.id);
    expect(Number(row.total_fee)).toBe(7500);
    expect(Number(row.balance)).toBe(3500);

    const tooLow = await administrator.client.rpc("update_enrollment_fees", { ...args, p_scholarship: 6000 });
    expect(tooLow.error?.message).toMatch(/already paid/);
    row = await overview(accounts.client, e.id);
    expect(Number(row.total_fee)).toBe(7500);
  });

  it("lets a Super Admin refund and void, with receipts kept for history", async () => {
    const course = await createCourse({ tuition: 2000 });
    const e = await registeredEnrollment(course.id);
    const paid = await payment(e.id, 2000);
    expect(paid.error).toBeNull();

    const tooMuch = await superAdmin.client.rpc("record_refund", {
      p_enrollment_id: e.id, p_amount: 2500, p_method: "cash", p_payment_date: today, p_idempotency_key: newKey(), p_remarks: "Course cancelled",
    });
    expect(tooMuch.error?.hint).toBe("amount");
    const refund = await superAdmin.client.rpc("record_refund", {
      p_enrollment_id: e.id, p_amount: 2000, p_method: "cash", p_payment_date: today, p_idempotency_key: newKey(), p_remarks: "Course cancelled",
    });
    expect(refund.error).toBeNull();
    expect(refund.data.receipt_no).toMatch(/^RFD-/);
    expect((await overview(accounts.client, e.id)).payment_status).toBe("refunded");

    const voidRefund = await superAdmin.client.rpc("void_payment", { p_payment_id: refund.data.payment_id, p_reason: "Entered by mistake" });
    expect(voidRefund.error).toBeNull();
    expect(Number((await overview(accounts.client, e.id)).balance)).toBe(0);
    const again = await superAdmin.client.rpc("void_payment", { p_payment_id: refund.data.payment_id, p_reason: "Entered by mistake" });
    expect(again.error?.code).toBe("PT409");
    const { data: receipt } = await service.from("payment_receipts").select("is_void").eq("payment_id", refund.data.payment_id).single();
    expect(receipt!.is_void).toBe(true);
  });
});

describe("reports", () => {
  it("returns collections by period, payment method and course", async () => {
    const course = await createCourse({ tuition: 4000 });
    const e = await registeredEnrollment(course.id);
    await payment(e.id, 1500);
    await payment(e.id, 500, { p_method: "card", p_transaction_reference: `CARD-${newKey().slice(0, 8)}` });

    for (const period of ["day", "week", "month", "year"]) {
      const { data, error } = await accounts.client.rpc("report_collections", { p_from: today, p_to: today, p_period: period });
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(Number(data[0].collected)).toBeGreaterThanOrEqual(2000);
    }
    const { data: methods } = await accounts.client.rpc("report_payment_methods", { p_from: today, p_to: today });
    expect(methods.map((m: { method: string }) => m.method)).toContain("card");

    const { data: revenue } = await accounts.client.rpc("report_course_revenue", { p_from: today, p_to: today });
    const line = revenue.find((r: { course_id: string }) => r.course_id === course.id);
    expect(Number(line.billed)).toBe(4000);
    expect(Number(line.collected_in_period)).toBe(2000);
    expect(Number(line.outstanding)).toBe(2000);
  });

  it("builds the dashboard from live records", async () => {
    const { data, error } = await accounts.client.rpc("dashboard_summary", { p_from: await dbDate(-60), p_to: today });
    expect(error).toBeNull();
    expect(data.can_view_fees).toBe(true);
    expect(data.cards.total_students).toBeGreaterThan(0);
    expect(Number(data.cards.fees_collected)).toBeGreaterThan(0);
    expect(data.monthly_registrations.length).toBeGreaterThanOrEqual(2);
    const { count } = await service.from("students").select("*", { count: "exact", head: true });
    expect(data.cards.total_students).toBe(count);
    const byStatus = Object.values(data.conversion.by_status as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(Number(data.conversion.total)).toBe(byStatus);
    expect(Number(data.conversion.total)).toBe(data.cards.period_registrations);
  });

  it("rejects invalid report ranges", async () => {
    const { error } = await accounts.client.rpc("report_collections", { p_from: today, p_to: await dbDate(-1), p_period: "day" });
    expect(error?.hint).toBe("from");
  });
});

describe("receipts", () => {
  it("are only created for successfully recorded payments", async () => {
    const course = await createCourse({ tuition: 100 });
    const e = await registeredEnrollment(course.id);
    await payment(e.id, 500); // rejected: exceeds balance
    const { data } = await service.from("payment_receipts").select("id").eq("enrollment_id", e.id);
    expect(data).toEqual([]);
  });

  it("cannot be edited or deleted", async () => {
    const course = await createCourse({ tuition: 100 });
    const e = await registeredEnrollment(course.id);
    const { data: r } = await payment(e.id, 100);
    expect((await service.from("payment_receipts").update({ amount: 1 }).eq("id", r.id)).error).not.toBeNull();
    expect((await service.from("payment_receipts").delete().eq("id", r.id)).error).not.toBeNull();
  });
});
