import { useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Button, IconButton } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/FeedbackProvider";
import { Field } from "../../components/ui/Field";
import { Modal } from "../../components/ui/Modal";
import { toAppError, unwrap } from "../../lib/errors";
import {
  addDays, ADMISSION_STATUSES, formatDate, formatMoney, GENDER_LABELS, isoDate, METHOD_LABELS, MODE_LABELS,
  PAYMENT_METHODS, STATUS_LABELS, type AdmissionStatus, type Gender, type PaymentMethod,
} from "../../lib/format";
import { isMoneyInput, splitEvenly, subtractMoney, sumMoney, toMoneyInput, toPaise } from "../../lib/money";
import { supabase } from "../../lib/supabase";
import type { EnrollmentOverview, EnrollmentRow, InstallmentRow, ReceiptResult, StudentRow } from "../../lib/types";
import { normalizeMobile } from "../../lib/validation";
import { useQuery } from "../../hooks/useQuery";

interface BaseProps {
  enrollment: EnrollmentOverview;
  onClose: () => void;
  onSaved: () => void;
}

type Errors = Record<string, string | undefined>;

function useSubmit(onSaved: () => void, onClose: () => void, success: string) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busy) return undefined;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await fn();
      toast(success);
      onSaved();
      onClose();
      return result;
    } catch (err) {
      const e = toAppError(err);
      setError(e.message);
      if (e.field) setFieldErrors({ [e.field]: e.message });
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, fieldErrors, setError, setFieldErrors, run };
}

// ------------------------------------------------------------------ Status
export function StatusModal({ enrollment, onClose, onSaved }: BaseProps) {
  const [status, setStatus] = useState<AdmissionStatus>(enrollment.status as AdmissionStatus);
  const [note, setNote] = useState("");
  const { busy, error, run } = useSubmit(onSaved, onClose, "Admission status updated");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => unwrap(supabase.rpc("update_enrollment_status", { p_enrollment_id: enrollment.id!, p_status: status, p_note: note || undefined })));
  };

  return (
    <Modal title="Update admission status" description={`${enrollment.full_name} · ${enrollment.course_title}`} onClose={onClose} size="sm">
      <form className="form" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <Field label="New status" required>
          <select value={status} onChange={(e) => setStatus(e.target.value as AdmissionStatus)}>
            {ADMISSION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="Note (optional)" hint="Saved in the admission timeline">
          <textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={status === enrollment.status}>Save status</Button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ Batch
export function BatchModal({ enrollment, onClose, onSaved }: BaseProps) {
  const batches = useQuery(
    () => unwrap(supabase.from("batches").select("*").eq("course_id", enrollment.course_id!).eq("is_active", true).order("start_date")),
    [enrollment.course_id],
  );
  const [batchId, setBatchId] = useState(enrollment.batch_id ?? "");
  const { busy, error, run } = useSubmit(onSaved, onClose, "Batch updated");

  return (
    <Modal title="Change batch" description={enrollment.course_title ?? ""} onClose={onClose} size="sm">
      <form className="form" onSubmit={(e) => { e.preventDefault(); void run(() => unwrap(supabase.rpc("update_enrollment_batch", { p_enrollment_id: enrollment.id!, p_batch_id: batchId || undefined }))); }}>
        {error && <Alert>{error}</Alert>}
        <Field label="Batch">
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">No batch</option>
            {batches.data?.map((b) => (
              <option key={b.id} value={b.id}>{b.name} · {MODE_LABELS[b.mode]} · {formatDate(b.start_date)}</option>
            ))}
          </select>
        </Field>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ Fee configuration
export function FeeConfigModal({ enrollment, row, onClose, onSaved }: BaseProps & { row: EnrollmentRow }) {
  const [form, setForm] = useState({
    tuition_fee: toMoneyInput(row.tuition_fee),
    admission_fee: toMoneyInput(row.admission_fee),
    registration_fee: toMoneyInput(row.registration_fee),
    additional_charges: toMoneyInput(row.additional_charges),
    discount: toMoneyInput(row.discount),
    scholarship: toMoneyInput(row.scholarship),
    installment_count: String(Math.max(1, row.installment_count)),
    first_due_date: enrollment.batch_start_date ?? isoDate(),
    interval_months: "1",
    remarks: row.fee_remarks ?? "",
  });
  const { busy, error, fieldErrors, setFieldErrors, run } = useSubmit(onSaved, onClose, "Fee updated and installments regenerated");
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const moneyKeys = ["tuition_fee", "admission_fee", "registration_fee", "additional_charges", "discount", "scholarship"] as const;
  const total = sumMoney([form.tuition_fee, form.admission_fee, form.registration_fee, form.additional_charges]) -
    sumMoney([form.discount, form.scholarship]);
  const totalFixed = Math.round(total * 100) / 100;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    for (const k of moneyKeys) if (!isMoneyInput(form[k] || "0")) errs[k] = "Enter a valid amount";
    if (totalFixed < 0) errs.discount = "Discount and scholarship cannot exceed the fee";
    if (toPaise(totalFixed) < toPaise(enrollment.net_paid ?? 0)) errs.tuition_fee = `Cannot be less than amount paid (${formatMoney(enrollment.net_paid)})`;
    const count = Number(form.installment_count);
    if (!Number.isInteger(count) || count < 1 || count > 36) errs.installment_count = "1-36";
    if (!form.first_due_date) errs.first_due_date = "Required";
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    void run(() =>
      unwrap(supabase.rpc("update_enrollment_fees", {
        p_enrollment_id: enrollment.id!,
        p_tuition_fee: Number(form.tuition_fee || 0),
        p_admission_fee: Number(form.admission_fee || 0),
        p_registration_fee: Number(form.registration_fee || 0),
        p_additional_charges: Number(form.additional_charges || 0),
        p_discount: Number(form.discount || 0),
        p_scholarship: Number(form.scholarship || 0),
        p_installment_count: count,
        p_first_due_date: form.first_due_date,
        p_interval_months: Number(form.interval_months),
        p_remarks: form.remarks || undefined,
      })),
    );
  };

  const moneyField = (k: (typeof moneyKeys)[number], label: string) => (
    <Field label={label} error={fieldErrors[k]}>
      <input inputMode="decimal" value={form[k]} onChange={set(k)} />
    </Field>
  );

  return (
    <Modal title="Configure fees" description={`${enrollment.full_name} · ${enrollment.registration_no}`} onClose={onClose} size="lg">
      <form className="form" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <Alert tone="info">This is the agreed fee for this student only. Course prices are not changed.</Alert>
        <div className="grid-3">
          {moneyField("tuition_fee", "Tuition fee")}
          {moneyField("admission_fee", "Admission fee")}
          {moneyField("registration_fee", "Registration fee")}
          {moneyField("additional_charges", "Additional charges")}
          {moneyField("discount", "Discount")}
          {moneyField("scholarship", "Scholarship")}
        </div>
        <div className="fee-summary">
          <div className="fee-total"><span>Total payable</span><strong>{formatMoney(totalFixed)}</strong></div>
          <div><span>Already paid</span><strong>{formatMoney(enrollment.net_paid)}</strong></div>
        </div>
        <div className="grid-3">
          <Field label="Installments" error={fieldErrors.installment_count}>
            <input type="number" min={1} max={36} value={form.installment_count} onChange={set("installment_count")} />
          </Field>
          <Field label="First due date" error={fieldErrors.first_due_date}>
            <input type="date" value={form.first_due_date} onChange={set("first_due_date")} />
          </Field>
          <Field label="Every">
            <select value={form.interval_months} onChange={set("interval_months")}>
              {[1, 2, 3, 6].map((m) => <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Remarks (reason for change)">
          <input maxLength={500} value={form.remarks} onChange={set("remarks")} />
        </Field>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save fee</Button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ Installment plan
export function InstallmentPlanModal({
  enrollment, installments, onClose, onSaved,
}: BaseProps & { installments: InstallmentRow[] }) {
  const [rows, setRows] = useState(
    installments.length
      ? installments.map((i) => ({ due_date: i.due_date, amount: toMoneyInput(i.amount), label: i.label ?? "" }))
      : [{ due_date: isoDate(), amount: toMoneyInput(enrollment.total_fee), label: "" }],
  );
  const { busy, error, setError, run } = useSubmit(onSaved, onClose, "Installment plan saved");
  const total = sumMoney(rows.map((r) => r.amount));
  const diff = subtractMoney(enrollment.total_fee ?? 0, total);

  const update = (i: number, key: "due_date" | "amount" | "label", value: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  const autoSplit = () => {
    const parts = splitEvenly(enrollment.total_fee ?? 0, rows.length);
    setRows((rs) => rs.map((r, i) => ({ ...r, amount: toMoneyInput(parts[i] ?? 0) })));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (rows.some((r) => !r.due_date || !isMoneyInput(r.amount) || toPaise(r.amount) <= 0)) {
      setError("Every installment needs a due date and an amount greater than zero.");
      return;
    }
    if (diff !== 0) {
      setError(`Installments must add up to ${formatMoney(enrollment.total_fee)}.`);
      return;
    }
    void run(() =>
      unwrap(supabase.rpc("save_installment_plan", {
        p_enrollment_id: enrollment.id!,
        p_installments: rows.map((r) => ({ due_date: r.due_date, amount: r.amount, label: r.label || null })),
      })),
    );
  };

  return (
    <Modal title="Installment schedule" description={`Total fee ${formatMoney(enrollment.total_fee)}`} onClose={onClose} size="lg">
      <form className="form" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>#</th><th>Due date</th><th>Amount</th><th>Label</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><input type="date" aria-label={`Installment ${i + 1} due date`} value={r.due_date} onChange={(e) => update(i, "due_date", e.target.value)} /></td>
                  <td><input inputMode="decimal" aria-label={`Installment ${i + 1} amount`} value={r.amount} onChange={(e) => update(i, "amount", e.target.value)} /></td>
                  <td><input aria-label={`Installment ${i + 1} label`} maxLength={60} value={r.label} onChange={(e) => update(i, "label", e.target.value)} placeholder="e.g. Admission" /></td>
                  <td>
                    <IconButton label="Remove installment" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                      <Trash2 size={16} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row-between">
          <div className="btn-row">
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} disabled={rows.length >= 36}
              onClick={() => setRows((rs) => [...rs, { due_date: addDays(rs[rs.length - 1]?.due_date ?? isoDate(), 30), amount: "0.00", label: "" }])}>
              Add installment
            </Button>
            <Button variant="ghost" size="sm" icon={<Wand2 size={14} />} onClick={autoSplit}>Split equally</Button>
          </div>
          <span className={diff === 0 ? "text-success" : "text-danger"}>
            Total {formatMoney(total)} {diff !== 0 && `(${diff > 0 ? "short by" : "over by"} ${formatMoney(Math.abs(diff))})`}
          </span>
        </div>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save schedule</Button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ Payment / refund
export function PaymentModal({
  enrollment, mode = "payment", onClose, onSaved,
}: BaseProps & { mode?: "payment" | "refund" }) {
  const navigate = useNavigate();
  const refund = mode === "refund";
  const balance = Number(enrollment.balance ?? 0);
  const defaultAmount = refund ? 0 : Number(enrollment.next_due_amount ?? balance);
  const [form, setForm] = useState({
    amount: defaultAmount > 0 ? toMoneyInput(defaultAmount) : "",
    method: "cash" as PaymentMethod,
    payment_date: isoDate(),
    reference: "",
    remarks: "",
  });
  const key = useRef(crypto.randomUUID());
  const { busy, error, fieldErrors, setFieldErrors, run } = useSubmit(onSaved, onClose, refund ? "Refund recorded" : "Payment recorded");
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const needsReference = form.method !== "cash" && form.method !== "other";
  const limit = refund ? Number(enrollment.net_paid ?? 0) : balance;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    if (!isMoneyInput(form.amount) || toPaise(form.amount) <= 0) errs.amount = "Enter an amount greater than zero (max 2 decimals)";
    else if (toPaise(form.amount) > toPaise(limit)) errs.amount = `Cannot exceed ${formatMoney(limit)}`;
    if (!form.payment_date || form.payment_date > isoDate()) errs.payment_date = "Date cannot be in the future";
    if (needsReference && !form.reference.trim()) errs.transaction_reference = "Required for this payment method";
    if (refund && form.remarks.trim().length < 5) errs.remarks = "Enter the reason for the refund";
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    const receipt = await run(async () => {
      const args = {
        p_enrollment_id: enrollment.id!,
        p_amount: form.amount.trim() as unknown as number,
        p_method: form.method,
        p_payment_date: form.payment_date,
        p_idempotency_key: key.current,
        p_transaction_reference: form.reference.trim() || undefined,
        p_remarks: form.remarks.trim() || undefined,
      };
      const res = refund ? await supabase.rpc("record_refund", args) : await supabase.rpc("record_payment", args);
      if (res.error) throw res.error;
      return res.data as unknown as ReceiptResult;
    });
    if (receipt) navigate(`/admin/receipts/${receipt.id}`);
  };

  return (
    <Modal
      title={refund ? "Record refund" : "Record payment"}
      description={`${enrollment.full_name} · ${enrollment.registration_no} · ${enrollment.course_title}`}
      onClose={onClose}
    >
      <form className="form" onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="fee-summary">
          <div><span>Total fee</span><strong>{formatMoney(enrollment.total_fee)}</strong></div>
          <div><span>Paid so far</span><strong>{formatMoney(enrollment.net_paid)}</strong></div>
          <div className="fee-total"><span>Outstanding</span><strong>{formatMoney(balance)}</strong></div>
          {!refund && enrollment.next_due_date && (
            <p className="muted small">Next installment: {formatMoney(enrollment.next_due_amount)} due {formatDate(enrollment.next_due_date)}</p>
          )}
        </div>
        <div className="grid-2">
          <Field label="Amount" required error={fieldErrors.amount}>
            <input inputMode="decimal" value={form.amount} onChange={set("amount")} autoFocus />
          </Field>
          <Field label={refund ? "Refund date" : "Payment date"} required error={fieldErrors.payment_date}>
            <input type="date" max={isoDate()} value={form.payment_date} onChange={set("payment_date")} />
          </Field>
          <Field label="Method" required error={fieldErrors.method}>
            <select value={form.method} onChange={set("method")}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
            </select>
          </Field>
          <Field label="Transaction reference" required={needsReference} error={fieldErrors.transaction_reference} hint="UPI ref, cheque no., bank UTR...">
            <input maxLength={100} value={form.reference} onChange={set("reference")} />
          </Field>
        </div>
        <Field label={refund ? "Reason" : "Remarks"} required={refund} error={fieldErrors.remarks}>
          <input maxLength={500} value={form.remarks} onChange={set("remarks")} />
        </Field>
        <p className="muted small">A receipt number is generated automatically when the {refund ? "refund" : "payment"} is saved.</p>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={refund ? "danger" : "primary"} loading={busy}>
            {refund ? "Record refund" : "Save payment & issue receipt"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ Void
export function VoidPaymentModal({
  paymentId, label, onClose, onSaved,
}: { paymentId: string; label: string; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onSaved, onClose, "Entry voided");
  return (
    <Modal title="Void entry" description={label} onClose={onClose} size="sm">
      <form className="form" onSubmit={(e) => { e.preventDefault(); void run(() => unwrap(supabase.rpc("void_payment", { p_payment_id: paymentId, p_reason: reason }))); }}>
        {error && <Alert>{error}</Alert>}
        <Alert tone="warning">Voided entries stay in the records for audit but no longer count towards balances. This cannot be undone.</Alert>
        <Field label="Reason" required>
          <textarea rows={3} minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" loading={busy} disabled={reason.trim().length < 5}>Void entry</Button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ Edit student
export function EditStudentModal({ student, onClose, onSaved }: { student: StudentRow; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: student.full_name,
    email: student.email,
    mobile: student.mobile,
    alt_mobile: student.alt_mobile ?? "",
    date_of_birth: student.date_of_birth ?? "",
    gender: student.gender ?? "",
    address_line: student.address_line ?? "",
    city: student.city,
    state: student.state,
    postal_code: student.postal_code,
    highest_qualification: student.highest_qualification,
    institution_name: student.institution_name ?? "",
  });
  const { busy, error, fieldErrors, setFieldErrors, run } = useSubmit(onSaved, onClose, "Student details updated");
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const mobile = normalizeMobile(form.mobile);
    const alt = form.alt_mobile.trim() ? normalizeMobile(form.alt_mobile) : null;
    const errs: Errors = {};
    if (form.full_name.trim().length < 2) errs.full_name = "Required";
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(form.email.trim())) errs.email = "Enter a valid email";
    if (!mobile) errs.mobile = "Enter a valid mobile number";
    if (form.alt_mobile.trim() && !alt) errs.alt_mobile = "Enter a valid mobile number";
    if (form.city.trim().length < 2) errs.city = "Required";
    if (form.state.trim().length < 2) errs.state = "Required";
    if (!/^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(form.postal_code.trim())) errs.postal_code = "Invalid postal code";
    if (form.highest_qualification.trim().length < 2) errs.highest_qualification = "Required";
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    void run(() =>
      unwrap(supabase.from("students").update({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        mobile: mobile!,
        alt_mobile: alt,
        date_of_birth: form.date_of_birth || null,
        gender: (form.gender || null) as Gender | null,
        address_line: form.address_line.trim() || null,
        city: form.city.trim(),
        state: form.state.trim(),
        postal_code: form.postal_code.trim().toUpperCase(),
        highest_qualification: form.highest_qualification.trim(),
        institution_name: form.institution_name.trim() || null,
      }).eq("id", student.id).select().single()),
    );
  };

  const text = (k: keyof typeof form, label: string, props: Record<string, unknown> = {}) => (
    <Field label={label} error={fieldErrors[k]}>
      <input value={form[k]} onChange={set(k)} {...props} />
    </Field>
  );

  return (
    <Modal title="Edit student details" description={student.student_code} onClose={onClose} size="lg">
      <form className="form" onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="grid-3">
          {text("full_name", "Full name", { maxLength: 100 })}
          {text("email", "Email", { type: "email", maxLength: 200 })}
          {text("mobile", "Mobile", { type: "tel" })}
          {text("alt_mobile", "Alternate mobile", { type: "tel" })}
          {text("date_of_birth", "Date of birth", { type: "date" })}
          <Field label="Gender">
            <select value={form.gender} onChange={set("gender")}>
              <option value="">Not specified</option>
              {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => <option key={g} value={g}>{GENDER_LABELS[g]}</option>)}
            </select>
          </Field>
        </div>
        {text("address_line", "Address", { maxLength: 300 })}
        <div className="grid-3">
          {text("city", "City", { maxLength: 80 })}
          {text("state", "State", { maxLength: 80 })}
          {text("postal_code", "Postal code", { maxLength: 10 })}
          {text("highest_qualification", "Highest qualification", { maxLength: 120 })}
          {text("institution_name", "Institution", { maxLength: 150 })}
        </div>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save changes</Button>
        </div>
      </form>
    </Modal>
  );
}

/** FIFO allocation of paid amount to installments, for display only (balances come from the database). */
export function useInstallmentStatus(installments: InstallmentRow[], netPaid: number | null, today = isoDate()) {
  return useMemo(() => {
    let remaining = toPaise(netPaid ?? 0);
    return installments.map((i) => {
      const amount = toPaise(i.amount);
      const covered = Math.min(amount, Math.max(remaining, 0));
      remaining -= amount;
      const status = covered >= amount ? "paid" : covered > 0 ? "partially_paid" : i.due_date < today ? "overdue" : "pending";
      return { ...i, paid: covered / 100, status };
    });
  }, [installments, netPaid, today]);
}
