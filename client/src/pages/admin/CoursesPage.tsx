import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { CalendarRange, FolderTree, ImagePlus, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { CourseVisual } from "../../components/public/CourseVisual";
import { Badge } from "../../components/ui/Badge";
import { Button, IconButton } from "../../components/ui/Button";
import { Alert, EmptyState, ErrorState, SkeletonRows } from "../../components/ui/Feedback";
import { useConfirm, useToast } from "../../components/ui/FeedbackProvider";
import { Field } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/Layout";
import { Modal } from "../../components/ui/Modal";
import { useQuery } from "../../hooks/useQuery";
import { toAppError, unwrap } from "../../lib/errors";
import {
  COURSE_STATUS_LABELS, formatDate, formatDuration, formatMoney, LEVEL_LABELS, MODE_LABELS,
  type BatchMode, type CourseLevel, type CourseStatus, type DurationUnit,
} from "../../lib/format";
import { isMoneyInput, sumMoney, toMoneyInput } from "../../lib/money";
import { PUBLIC_BUCKET, supabase } from "../../lib/supabase";
import type { BatchRow, CategoryRow, CourseRow, FeeStructureRow } from "../../lib/types";

type CourseWithMeta = CourseRow & {
  category: { name: string } | null;
  fee_structures: FeeStructureRow[];
  batches: { id: string; is_active: boolean }[];
  student_enrollments: { count: number }[];
};

export default function CoursesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | CourseStatus>("");
  const [editing, setEditing] = useState<CourseWithMeta | "new" | null>(null);
  const [batchesFor, setBatchesFor] = useState<CourseWithMeta | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const courses = useQuery(
    async () =>
      (await unwrap(
        supabase
          .from("courses")
          .select("*, category:course_categories(name), fee_structures(*), batches(id, is_active), student_enrollments(count)")
          .order("sort_order")
          .order("title"),
      )) as unknown as CourseWithMeta[],
    [],
  );

  const rows = (courses.data ?? []).filter(
    (c) =>
      (!status || c.status === status) &&
      (!search.trim() || `${c.title} ${c.code}`.toLowerCase().includes(search.trim().toLowerCase())),
  );

  const setCourseStatus = async (c: CourseWithMeta, next: CourseStatus) => {
    if (next === "inactive") {
      const ok = await confirm({
        title: "Deactivate course?",
        message: "The course will be hidden from the website and new registrations will stop. Existing students and payments are kept.",
        confirmLabel: "Deactivate",
        tone: "danger",
      });
      if (!ok) return;
    }
    const { error } = await supabase.from("courses").update({ status: next }).eq("id", c.id);
    if (error) toast(toAppError(error).message, "error");
    else {
      toast(`Course ${COURSE_STATUS_LABELS[next].toLowerCase()}`);
      courses.reload();
    }
  };

  const remove = async (c: CourseWithMeta) => {
    const ok = await confirm({ title: "Delete course?", message: `Permanently delete ${c.title}? This is only possible because it has no registrations.`, confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.rpc("delete_course", { p_course_id: c.id });
    if (error) toast(toAppError(error).message, "error");
    else {
      toast("Course deleted");
      courses.reload();
    }
  };

  return (
    <>
      <PageHeader
        title="Courses"
        description="Manage the course catalogue, fees and batches. Fee changes never affect existing students."
        actions={
          <>
            <Button variant="secondary" icon={<FolderTree size={16} />} onClick={() => setCategoriesOpen(true)}>Categories</Button>
            <Button icon={<Plus size={16} />} onClick={() => setEditing("new")}>New course</Button>
          </>
        }
      />
      <div className="card filter-bar">
        <label className="search-box">
          <Search size={16} aria-hidden />
          <span className="sr-only">Search courses</span>
          <input type="search" placeholder="Search by title or code" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as CourseStatus | "")}>
          <option value="">All statuses</option>
          {(Object.keys(COURSE_STATUS_LABELS) as CourseStatus[]).map((s) => <option key={s} value={s}>{COURSE_STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {courses.error && <ErrorState message={courses.error.message} onRetry={courses.reload} />}
      <div className="card table-card">
        {courses.loading && !courses.data ? (
          <SkeletonRows rows={5} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={courses.data?.length ? "No courses match" : "No courses yet"}
            description={courses.data?.length ? undefined : "Create your first course to start accepting registrations."}
            action={!courses.data?.length && <Button icon={<Plus size={16} />} onClick={() => setEditing("new")}>New course</Button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr><th>Course</th><th>Category</th><th className="num">Fee</th><th>Duration</th><th className="num">Students</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const fee = c.fee_structures.find((f) => f.is_current);
                  const students = c.student_enrollments[0]?.count ?? 0;
                  return (
                    <tr key={c.id}>
                      <td data-label="Course">
                        <div className="course-cell">
                          <CourseVisual imagePath={c.image_path} title={c.title} category={c.category?.name} />
                          <div>
                            <strong>{c.title}</strong>
                            <div className="muted small mono">{c.code}{c.is_featured && <Badge tone="accent">Featured</Badge>}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Category">{c.category?.name ?? "-"}</td>
                      <td data-label="Fee" className="num">{fee ? formatMoney(fee.total_fee) : <span className="text-warning small">Not set</span>}</td>
                      <td data-label="Duration">{formatDuration(c.duration_value, c.duration_unit as DurationUnit)}</td>
                      <td data-label="Students" className="num">
                        <Link to={`/admin/students?course=${c.id}`} title="View registered students"><Users size={14} aria-hidden /> {students}</Link>
                      </td>
                      <td data-label="Status">
                        <select
                          aria-label={`Status of ${c.title}`}
                          className="select-sm"
                          value={c.status}
                          onChange={(e) => void setCourseStatus(c, e.target.value as CourseStatus)}
                        >
                          {(Object.keys(COURSE_STATUS_LABELS) as CourseStatus[]).map((s) => <option key={s} value={s}>{COURSE_STATUS_LABELS[s]}</option>)}
                        </select>
                      </td>
                      <td className="actions">
                        <IconButton label={`Edit ${c.title}`} onClick={() => setEditing(c)}><Pencil size={16} /></IconButton>
                        <IconButton label={`Batches for ${c.title}`} onClick={() => setBatchesFor(c)}><CalendarRange size={16} /></IconButton>
                        {students === 0 && <IconButton label={`Delete ${c.title}`} onClick={() => void remove(c)}><Trash2 size={16} /></IconButton>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <CourseFormModal course={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={courses.reload} />}
      {batchesFor && <BatchesModal course={batchesFor} onClose={() => { setBatchesFor(null); courses.reload(); }} />}
      {categoriesOpen && <CategoriesModal onClose={() => { setCategoriesOpen(false); courses.reload(); }} />}
    </>
  );
}

// ------------------------------------------------------------------ Course form
function CourseFormModal({ course, onClose, onSaved }: { course: CourseWithMeta | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const categories = useQuery(() => unwrap(supabase.from("course_categories").select("*").order("sort_order").order("name")), []);
  const fee = course?.fee_structures.find((f) => f.is_current);
  const [form, setForm] = useState({
    code: course?.code ?? "",
    title: course?.title ?? "",
    category_id: course?.category_id ?? "",
    short_description: course?.short_description ?? "",
    description: course?.description ?? "",
    eligibility: course?.eligibility ?? "",
    level: (course?.level ?? "all_levels") as CourseLevel,
    duration_value: String(course?.duration_value ?? ""),
    duration_unit: (course?.duration_unit ?? "months") as DurationUnit,
    highlights: (course?.highlights ?? []).join("\n"),
    max_capacity: course?.max_capacity ? String(course.max_capacity) : "",
    is_featured: course?.is_featured ?? false,
    status: (course?.status ?? "draft") as CourseStatus,
    sort_order: String(course?.sort_order ?? 0),
    tuition_fee: fee ? toMoneyInput(fee.tuition_fee) : "",
    admission_fee: fee ? toMoneyInput(fee.admission_fee) : "0.00",
    registration_fee: fee ? toMoneyInput(fee.registration_fee) : "0.00",
    installment_count: String(fee?.installment_count ?? 1),
    interval_months: String(fee?.installment_interval_months ?? 1),
  });
  const [image, setImage] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(form.code.trim().toUpperCase())) e.code = "2-20 letters, numbers or hyphens";
    if (form.title.trim().length < 3) e.title = "At least 3 characters";
    if (form.short_description.trim().length < 10 || form.short_description.length > 300) e.short_description = "10-300 characters";
    const d = Number(form.duration_value);
    if (!Number.isInteger(d) || d < 1 || d > 1000) e.duration_value = "Enter a whole number";
    if (form.max_capacity && (!Number.isInteger(Number(form.max_capacity)) || Number(form.max_capacity) < 1)) e.max_capacity = "Whole number above 0";
    if (!isMoneyInput(form.tuition_fee)) e.tuition_fee = "Enter a valid amount";
    if (!isMoneyInput(form.admission_fee || "0")) e.admission_fee = "Enter a valid amount";
    if (!isMoneyInput(form.registration_fee || "0")) e.registration_fee = "Enter a valid amount";
    const n = Number(form.installment_count);
    if (!Number.isInteger(n) || n < 1 || n > 36) e.installment_count = "1-36";
    if (form.highlights.split("\n").filter((h) => h.trim()).length > 12) e.highlights = "At most 12 highlights";
    if (image && (!["image/jpeg", "image/png", "image/webp"].includes(image.type) || image.size > 2 * 1024 * 1024)) {
      e.image = "JPG, PNG or WebP up to 2 MB";
    }
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError(null);
    try {
      let imagePath = course?.image_path ?? null;
      if (image) {
        const ext = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
        const path = `courses/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, image, { contentType: image.type, upsert: false });
        if (upErr) throw upErr;
        imagePath = path;
      }
      const payload = {
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        category_id: form.category_id || null,
        short_description: form.short_description.trim(),
        description: form.description.trim(),
        eligibility: form.eligibility.trim() || null,
        level: form.level,
        duration_value: Number(form.duration_value),
        duration_unit: form.duration_unit,
        highlights: form.highlights.split("\n").map((h) => h.trim()).filter(Boolean),
        max_capacity: form.max_capacity ? Number(form.max_capacity) : null,
        is_featured: form.is_featured,
        sort_order: Number(form.sort_order) || 0,
        image_path: imagePath,
      };
      // Save as-is (status last) so a course is never published without a fee.
      const saved = course
        ? await unwrap(supabase.from("courses").update(payload).eq("id", course.id).select().single())
        : await unwrap(supabase.from("courses").insert({ ...payload, status: "draft" }).select().single());
      await unwrap(supabase.rpc("set_course_fee", {
        p_course_id: saved.id,
        p_tuition_fee: form.tuition_fee as unknown as number,
        p_admission_fee: (form.admission_fee || "0") as unknown as number,
        p_registration_fee: (form.registration_fee || "0") as unknown as number,
        p_installment_count: Number(form.installment_count),
        p_interval_months: Number(form.interval_months),
      }));
      if (saved.status !== form.status) {
        await unwrap(supabase.from("courses").update({ status: form.status }).eq("id", saved.id).select().single());
      }
      if (image && course?.image_path) await supabase.storage.from(PUBLIC_BUCKET).remove([course.image_path]);
      toast(course ? "Course updated" : "Course created");
      onSaved();
      onClose();
    } catch (err) {
      const appErr = toAppError(err);
      setError(appErr.code === "23505" ? "A course with this code already exists." : appErr.message);
    } finally {
      setBusy(false);
    }
  };

  const total = sumMoney([form.tuition_fee, form.admission_fee, form.registration_fee]);

  return (
    <Modal title={course ? `Edit ${course.title}` : "New course"} onClose={onClose} size="xl">
      <form className="form" onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="grid-3">
          <Field label="Course code" required error={errors.code} hint="e.g. WEB101">
            <input value={form.code} maxLength={20} onChange={set("code")} />
          </Field>
          <Field label="Title" required error={errors.title} className="span-2">
            <input value={form.title} maxLength={150} onChange={set("title")} />
          </Field>
          <Field label="Category">
            <select value={form.category_id} onChange={set("category_id")}>
              <option value="">No category</option>
              {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Level">
            <select value={form.level} onChange={set("level")}>
              {(Object.keys(LEVEL_LABELS) as CourseLevel[]).map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
            </select>
          </Field>
          <div className="field-pair">
            <Field label="Duration" required error={errors.duration_value}>
              <input type="number" min={1} value={form.duration_value} onChange={set("duration_value")} />
            </Field>
            <Field label="Unit">
              <select value={form.duration_unit} onChange={set("duration_unit")}>
                {(["hours", "days", "weeks", "months", "years"] as DurationUnit[]).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <Field label="Short description" required error={errors.short_description} hint="Shown on course cards (10-300 characters)">
          <input value={form.short_description} maxLength={300} onChange={set("short_description")} />
        </Field>
        <Field label="Full description">
          <textarea rows={4} maxLength={8000} value={form.description} onChange={set("description")} />
        </Field>
        <div className="grid-2">
          <Field label="Eligibility">
            <input value={form.eligibility} maxLength={1000} onChange={set("eligibility")} placeholder="e.g. 12th pass" />
          </Field>
          <Field label="Maximum capacity" error={errors.max_capacity} hint="Leave blank for unlimited">
            <input type="number" min={1} value={form.max_capacity} onChange={set("max_capacity")} />
          </Field>
        </div>
        <Field label="Highlights" error={errors.highlights} hint="One per line, up to 12">
          <textarea rows={3} value={form.highlights} onChange={set("highlights")} />
        </Field>

        <fieldset>
          <legend>Fee structure</legend>
          {course && <p className="muted small">Changing the fee creates a new version for future registrations. Existing students keep their agreed fee.</p>}
          <div className="grid-3">
            <Field label="Tuition fee" required error={errors.tuition_fee}><input inputMode="decimal" value={form.tuition_fee} onChange={set("tuition_fee")} /></Field>
            <Field label="Admission fee" error={errors.admission_fee}><input inputMode="decimal" value={form.admission_fee} onChange={set("admission_fee")} /></Field>
            <Field label="Registration fee" error={errors.registration_fee}><input inputMode="decimal" value={form.registration_fee} onChange={set("registration_fee")} /></Field>
            <Field label="Installments" error={errors.installment_count}><input type="number" min={1} max={36} value={form.installment_count} onChange={set("installment_count")} /></Field>
            <Field label="Installment interval">
              <select value={form.interval_months} onChange={set("interval_months")}>
                {[1, 2, 3, 6].map((m) => <option key={m} value={m}>Every {m} month{m > 1 ? "s" : ""}</option>)}
              </select>
            </Field>
            <div className="fee-total-box"><span className="muted small">Total course fee</span><strong>{formatMoney(total)}</strong></div>
          </div>
        </fieldset>

        <div className="grid-3">
          <Field label="Course image" error={errors.image} hint="JPG, PNG or WebP, max 2 MB">
            <label className="file-input">
              <ImagePlus size={16} aria-hidden />
              <span>{image ? image.name : course?.image_path ? "Replace image" : "Choose image"}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={set("status")}>
              {(Object.keys(COURSE_STATUS_LABELS) as CourseStatus[]).map((s) => <option key={s} value={s}>{COURSE_STATUS_LABELS[s]}</option>)}
            </select>
          </Field>
          <Field label="Display order">
            <input type="number" value={form.sort_order} onChange={set("sort_order")} />
          </Field>
        </div>
        <label className="checkbox-inline">
          <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))} />
          Feature this course on the website
        </label>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{course ? "Save changes" : "Create course"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ Batches
function BatchesModal({ course, onClose }: { course: CourseWithMeta; onClose: () => void }) {
  const toast = useToast();
  const batches = useQuery(
    async () => (await unwrap(supabase.from("batches").select("*, student_enrollments(count)").eq("course_id", course.id).order("start_date"))) as unknown as (BatchRow & { student_enrollments: { count: number }[] })[],
    [course.id],
  );
  const empty = { id: "", name: "", start_date: "", end_date: "", schedule: "", mode: "classroom" as BatchMode, capacity: "", is_active: true };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (form.name.trim().length < 2 || !form.start_date) return setError("Enter a batch name and start date.");
    if (form.end_date && form.end_date < form.start_date) return setError("End date must be after the start date.");
    if (form.capacity && (!Number.isInteger(Number(form.capacity)) || Number(form.capacity) < 1)) return setError("Capacity must be a whole number.");
    setBusy(true);
    const payload = {
      course_id: course.id,
      name: form.name.trim(),
      start_date: form.start_date,
      end_date: form.end_date || null,
      schedule: form.schedule.trim() || null,
      mode: form.mode,
      capacity: form.capacity ? Number(form.capacity) : null,
      is_active: form.is_active,
    };
    const { error: err } = form.id
      ? await supabase.from("batches").update(payload).eq("id", form.id)
      : await supabase.from("batches").insert(payload);
    setBusy(false);
    if (err) return setError(toAppError(err).message);
    toast(form.id ? "Batch updated" : "Batch added");
    setForm(empty);
    batches.reload();
  };

  return (
    <Modal title={`Batches · ${course.title}`} onClose={onClose} size="xl">
      {batches.loading && !batches.data ? <SkeletonRows rows={3} cols={5} /> : batches.data?.length === 0 ? (
        <p className="muted">No batches yet. Students can still register without choosing a batch.</p>
      ) : (
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Batch</th><th>Dates</th><th>Mode</th><th className="num">Students / capacity</th><th>Status</th><th /></tr></thead>
            <tbody>
              {batches.data?.map((b) => (
                <tr key={b.id} className={b.is_active ? "" : "voided"}>
                  <td><strong>{b.name}</strong>{b.schedule && <div className="muted small">{b.schedule}</div>}</td>
                  <td>{formatDate(b.start_date)} - {formatDate(b.end_date)}</td>
                  <td>{MODE_LABELS[b.mode]}</td>
                  <td className="num">{b.student_enrollments[0]?.count ?? 0} / {b.capacity ?? "∞"}</td>
                  <td>{b.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Inactive</Badge>}</td>
                  <td>
                    <IconButton label={`Edit ${b.name}`} onClick={() => setForm({
                      id: b.id, name: b.name, start_date: b.start_date, end_date: b.end_date ?? "", schedule: b.schedule ?? "",
                      mode: b.mode, capacity: b.capacity ? String(b.capacity) : "", is_active: b.is_active,
                    })}><Pencil size={15} /></IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="form inset-form" onSubmit={save}>
        <h3>{form.id ? "Edit batch" : "Add batch"}</h3>
        {error && <Alert>{error}</Alert>}
        <div className="grid-3">
          <Field label="Name" required><input value={form.name} maxLength={100} onChange={set("name")} placeholder="e.g. Weekend Morning" /></Field>
          <Field label="Start date" required><input type="date" value={form.start_date} onChange={set("start_date")} /></Field>
          <Field label="End date"><input type="date" value={form.end_date} min={form.start_date} onChange={set("end_date")} /></Field>
          <Field label="Schedule"><input value={form.schedule} maxLength={200} onChange={set("schedule")} placeholder="Sat-Sun, 9 AM - 1 PM" /></Field>
          <Field label="Mode">
            <select value={form.mode} onChange={set("mode")}>
              {(Object.keys(MODE_LABELS) as BatchMode[]).map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
            </select>
          </Field>
          <Field label="Capacity" hint="Blank = unlimited"><input type="number" min={1} value={form.capacity} onChange={set("capacity")} /></Field>
        </div>
        <label className="checkbox-inline">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
          Active (open for registration)
        </label>
        <div className="form-actions">
          {form.id && <Button variant="ghost" onClick={() => setForm(empty)}>Cancel edit</Button>}
          <Button type="submit" loading={busy}>{form.id ? "Save batch" : "Add batch"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ Categories
function CategoriesModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const categories = useQuery(() => unwrap(supabase.from("course_categories").select("*").order("sort_order").order("name")), []);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (n.length < 2) return;
    setBusy(true);
    const { error } = editing
      ? await supabase.from("course_categories").update({ name: n, slug: slugify(n) }).eq("id", editing.id)
      : await supabase.from("course_categories").insert({ name: n, slug: slugify(n), sort_order: (categories.data?.length ?? 0) + 1 });
    setBusy(false);
    if (error) return toast(toAppError(error).message, "error");
    setName("");
    setEditing(null);
    categories.reload();
  };

  const toggle = async (c: CategoryRow) => {
    const { error } = await supabase.from("course_categories").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) toast(toAppError(error).message, "error");
    else categories.reload();
  };

  const remove = async (c: CategoryRow) => {
    if (!(await confirm({ title: "Delete category?", message: `Delete "${c.name}"? Categories used by courses cannot be deleted.`, tone: "danger", confirmLabel: "Delete" }))) return;
    const { error } = await supabase.from("course_categories").delete().eq("id", c.id);
    if (error) toast(toAppError(error).message, "error");
    else categories.reload();
  };

  return (
    <Modal title="Course categories" onClose={onClose}>
      <form className="note-form" onSubmit={save}>
        <input aria-label="Category name" placeholder="Category name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" size="sm" loading={busy} disabled={name.trim().length < 2}>{editing ? "Rename" : "Add"}</Button>
        {editing && <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setName(""); }}>Cancel</Button>}
      </form>
      <ul className="simple-list">
        {categories.data?.map((c) => (
          <li key={c.id}>
            <span className={c.is_active ? "" : "muted"}>{c.name}</span>
            <span className="actions">
              <Button variant="ghost" size="sm" onClick={() => void toggle(c)}>{c.is_active ? "Hide" : "Show"}</Button>
              <IconButton label={`Rename ${c.name}`} onClick={() => { setEditing(c); setName(c.name); }}><Pencil size={15} /></IconButton>
              <IconButton label={`Delete ${c.name}`} onClick={() => void remove(c)}><Trash2 size={15} /></IconButton>
            </span>
          </li>
        ))}
        {categories.data?.length === 0 && <li className="muted">No categories yet.</li>}
      </ul>
    </Modal>
  );
}
