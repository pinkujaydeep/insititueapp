import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, closeDb, createCourse, createStaff, register, registeredEnrollment, service, type Staff } from "./helpers";

let administrator: Staff, accounts: Staff;

beforeAll(async () => {
  [administrator, accounts] = await Promise.all([createStaff(["administrator"]), createStaff(["accounts_staff"])]);
});
afterAll(closeDb);

async function createViaAdmin(code: string) {
  return administrator.client
    .from("courses")
    .insert({
      code,
      title: `Admin Course ${code}`,
      short_description: "Created by an administrator in tests.",
      duration_value: 10,
      duration_unit: "weeks",
      eligibility: "12th pass",
      level: "beginner",
    })
    .select()
    .single();
}

const uniqueCode = () => `C${Date.now().toString(36).toUpperCase()}`.slice(0, 12);

describe("course management", () => {
  it("creates, prices, publishes and updates a course", async () => {
    const { data: course, error } = await createViaAdmin(uniqueCode());
    expect(error).toBeNull();
    expect(course.status).toBe("draft");

    const publishEarly = await administrator.client.from("courses").update({ status: "published" }).eq("id", course.id);
    expect(publishEarly.error?.message).toMatch(/fee/i);

    const fee = await administrator.client.rpc("set_course_fee", {
      p_course_id: course.id, p_tuition_fee: 20000, p_admission_fee: 1000, p_registration_fee: 500, p_installment_count: 2,
    });
    expect(fee.error).toBeNull();
    const publish = await administrator.client.from("courses").update({ status: "published" }).eq("id", course.id).select().single();
    expect(publish.error).toBeNull();

    const { data: catalog } = await anon().rpc("get_public_catalog");
    const listed = catalog.courses.find((c: { id: string }) => c.id === course.id);
    expect(Number(listed.total_fee)).toBe(21500);

    const upd = await administrator.client.from("courses").update({ title: "Renamed Course" }).eq("id", course.id).select().single();
    expect(upd.data.title).toBe("Renamed Course");
  });

  it("deactivating hides the course from the public catalogue", async () => {
    const course = await createCourse();
    await administrator.client.from("courses").update({ status: "inactive" }).eq("id", course.id);
    const { data: catalog } = await anon().rpc("get_public_catalog");
    expect(catalog.courses.some((c: { id: string }) => c.id === course.id)).toBe(false);
    const { error } = await register(course.id);
    expect(error?.code).toBe("PT404");
  });

  it("keeps the agreed fee on existing enrollments when the course price changes", async () => {
    const course = await createCourse({ tuition: 10000 });
    const before = await registeredEnrollment(course.id);
    const fee = await administrator.client.rpc("set_course_fee", { p_course_id: course.id, p_tuition_fee: 15000 });
    expect(fee.error).toBeNull();
    const after = await registeredEnrollment(course.id);

    const { data } = await service.from("student_enrollments").select("id, total_fee").in("id", [before.id, after.id]);
    const byId = Object.fromEntries(data!.map((r) => [r.id, Number(r.total_fee)]));
    expect(byId[before.id]).toBe(10000);
    expect(byId[after.id]).toBe(15000);

    const { data: versions } = await service.from("fee_structures").select("is_current").eq("course_id", course.id);
    expect(versions).toHaveLength(2);
    expect(versions!.filter((v) => v.is_current)).toHaveLength(1);
  });

  it("fee structures are immutable", async () => {
    const course = await createCourse();
    const { error } = await service.from("fee_structures").update({ tuition_fee: 1 }).eq("course_id", course.id);
    expect(error?.message).toMatch(/immutable/);
  });

  it("only deletes courses that were never used", async () => {
    const used = await createCourse();
    await registeredEnrollment(used.id, "new_enquiry");
    expect((await administrator.client.rpc("delete_course", { p_course_id: used.id })).error?.code).toBe("PT409");

    const unused = await createCourse();
    expect((await administrator.client.rpc("delete_course", { p_course_id: unused.id })).error).toBeNull();
    const { data } = await service.from("courses").select("id").eq("id", unused.id);
    expect(data).toEqual([]);
  });

  it("manages batches with capacity", async () => {
    const course = await createCourse();
    const { data: batch, error } = await administrator.client
      .from("batches")
      .insert({ course_id: course.id, name: "Morning", start_date: "2030-01-10", end_date: "2030-06-10", capacity: 25 })
      .select()
      .single();
    expect(error).toBeNull();
    const bad = await administrator.client.from("batches").insert({ course_id: course.id, name: "Bad", start_date: "2030-06-10", end_date: "2030-01-10" });
    expect(bad.error).not.toBeNull();
    const { data: catalog } = await anon().rpc("get_public_catalog");
    const listed = catalog.courses.find((c: { id: string }) => c.id === course.id);
    expect(listed.batches.map((b: { id: string }) => b.id)).toContain(batch.id);
  });

  it("accounts staff cannot create courses", async () => {
    const { error } = await accounts.client.from("courses").insert({
      code: uniqueCode(), title: "Nope", short_description: "Should not be created.", duration_value: 1,
    });
    expect(error?.code).toBe("42501");
  });
});
