import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, clearRateLimits, closeDb, createCourse, register, registrationPayload, service, sql } from "./helpers";

let course: Awaited<ReturnType<typeof createCourse>>;

beforeAll(async () => {
  course = await createCourse({ tuition: 12000, admission: 2000, registration: 1000, installments: 3 });
});
afterAll(closeDb);

describe("public registration", () => {
  it("registers a student and returns a registration number and student ID", async () => {
    const { data, error } = await register(course.id);
    expect(error).toBeNull();
    expect(data.registration_no).toMatch(/^REG-\d{4}-\d{5}$/);
    expect(data.student_code).toMatch(/^STU-\d{4}-\d{5}$/);
    expect(Number(data.total_fee)).toBe(15000);
    expect(data.replayed).toBe(false);

    const { data: enrollment } = await service
      .from("student_enrollments")
      .select("status, total_fee, installment_count, fee_installments(amount)")
      .eq("registration_no", data.registration_no)
      .single();
    expect(enrollment!.status).toBe("new_enquiry");
    expect(enrollment!.installment_count).toBe(3);
    const amounts = enrollment!.fee_installments.map((i: { amount: number }) => Number(i.amount));
    expect(amounts).toHaveLength(3);
    expect(amounts.reduce((a: number, b: number) => a + b, 0)).toBe(15000);
  });

  it("normalises Indian and international mobile numbers", async () => {
    const indian = await register(course.id, { p_mobile: "098765 43210" });
    expect(indian.error).toBeNull();
    const intl = await register(course.id, { p_mobile: "+44 7911 123456", p_postal_code: "SW1A 1AA" });
    expect(intl.error).toBeNull();
    const rows = await sql<{ mobile: string }>(
      "select s.mobile from public.students s join public.student_enrollments e on e.student_id = s.id where e.registration_no = any($1) order by s.mobile",
      [[indian.data.registration_no, intl.data.registration_no]],
    );
    expect(rows.map((r) => r.mobile).sort()).toEqual(["+447911123456", "+919876543210"]);
  });

  it.each([
    ["invalid email", { p_email: "not-an-email" }, "email"],
    ["invalid mobile (too short)", { p_mobile: "12345" }, "mobile"],
    ["invalid Indian mobile (starts with 5)", { p_mobile: "+91 5123456789" }, "mobile"],
    ["missing name", { p_full_name: "  " }, "full_name"],
    ["missing city", { p_city: "" }, "city"],
    ["missing state", { p_state: null }, "state"],
    ["invalid PIN code", { p_postal_code: "12" }, "postal_code"],
    ["missing qualification", { p_highest_qualification: "" }, "highest_qualification"],
    ["no privacy consent", { p_privacy_consent: false }, "privacy_consent"],
    ["future date of birth", { p_date_of_birth: "2999-01-01" }, "date_of_birth"],
  ])("rejects %s", async (_label, overrides, field) => {
    const { data, error } = await register(course.id, overrides);
    expect(data).toBeNull();
    expect(error?.hint).toBe(field);
  });

  it("returns the original result when the same submission is retried (double click)", async () => {
    const payload = registrationPayload(course.id);
    await clearRateLimits();
    const first = await anon().rpc("submit_registration", payload);
    const second = await anon().rpc("submit_registration", payload);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data.registration_no).toBe(first.data.registration_no);
    expect(second.data.replayed).toBe(true);
    const rows = await sql("select 1 from public.student_enrollments where client_token = $1", [payload.p_client_token]);
    expect(rows).toHaveLength(1);
  });

  it("rejects a second open application for the same course and email", async () => {
    const email = `dup-${Date.now()}@example.com`;
    expect((await register(course.id, { p_email: email })).error).toBeNull();
    const { error } = await register(course.id, { p_email: email.toUpperCase() });
    expect(error?.code).toBe("PT409");
  });

  it("does not overwrite an existing student's details from the public form", async () => {
    const email = `keep-${Date.now()}@example.com`;
    const other = await createCourse();
    await register(course.id, { p_email: email, p_city: "Pune" });
    await register(other.id, { p_email: email, p_city: "Hacked City" });
    const rows = await sql<{ city: string }>("select city from public.students where lower(email) = $1", [email]);
    expect(rows).toEqual([{ city: "Pune" }]);
  });

  it("rejects an unknown or unpublished course", async () => {
    const random = await register("00000000-0000-0000-0000-00000000dead");
    expect(random.error?.code).toBe("PT404");
    const draft = await createCourse({ publish: false });
    const unpublished = await register(draft.id);
    expect(unpublished.error?.code).toBe("PT404");
  });

  it("requires a batch when the course has batches and enforces batch capacity", async () => {
    const batched = await createCourse({ batch: { capacity: 1 } });
    expect((await register(batched.id)).error?.hint).toBe("batch_id");

    const first = await register(batched.id, { p_batch_id: batched.batchId });
    expect(first.error).toBeNull();
    await sql("update public.student_enrollments set status = 'enrolled' where registration_no = $1", [first.data.registration_no]);
    const second = await register(batched.id, { p_batch_id: batched.batchId });
    expect(second.error?.code).toBe("PT409");
    expect(second.error?.hint).toBe("batch_id");
  });

  it("silently rejects bots that fill the honeypot field", async () => {
    const { error } = await register(course.id, { p_website: "http://spam.example" });
    expect(error).not.toBeNull();
  });

  it("rejects script markup in names and strips HTML characters from free text", async () => {
    const badName = await register(course.id, { p_full_name: "<script>alert(1)</script>" });
    expect(badName.error?.hint).toBe("full_name");

    const { data, error } = await register(course.id, { p_message: '<img src=x onerror="alert(1)">Hello' });
    expect(error).toBeNull();
    const rows = await sql<{ student_message: string }>(
      "select student_message from public.student_enrollments where registration_no = $1",
      [data.registration_no],
    );
    expect(rows[0].student_message).toBe('img src=x onerror="alert(1)"Hello');
  });

  it("rate-limits repeated submissions from the same network", async () => {
    await clearRateLimits();
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await anon().rpc("submit_registration", registrationPayload(course.id)));
    }
    expect(results.slice(0, 5).every((r) => r.error === null)).toBe(true);
    expect(results[5].error?.code).toBe("PT429");
    await clearRateLimits();
  });
});
