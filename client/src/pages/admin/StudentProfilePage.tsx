import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft, Ban, CalendarClock, Mail, MessageCircle, MoreHorizontal, Pencil, Phone, Plus, Receipt, Undo2,
} from "lucide-react";
import { PaymentStatusBadge, StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { EmptyState, ErrorState, PageLoader } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/FeedbackProvider";
import { PageHeader } from "../../components/ui/Layout";
import { useAuth } from "../../hooks/useAuth";
import { useQuery } from "../../hooks/useQuery";
import { toAppError, unwrap } from "../../lib/errors";
import {
  formatDate, formatDateTime, formatMoney, GENDER_LABELS, METHOD_LABELS, type Gender, type PaymentMethod,
} from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { EnrollmentOverview, EnrollmentRow, InstallmentRow, LedgerRow } from "../../lib/types";
import {
  BatchModal, EditStudentModal, FeeConfigModal, InstallmentPlanModal, PaymentModal, StatusModal, VoidPaymentModal,
  useInstallmentStatus,
} from "./EnrollmentModals";

type ModalState =
  | { type: "status" | "batch" | "payment" | "refund"; enrollment: EnrollmentOverview }
  | { type: "fees"; enrollment: EnrollmentOverview; row: EnrollmentRow }
  | { type: "plan"; enrollment: EnrollmentOverview; installments: InstallmentRow[] }
  | { type: "void"; paymentId: string; label: string }
  | { type: "edit" }
  | null;

export default function StudentProfilePage() {
  const { id = "" } = useParams();
  const { can } = useAuth();
  const fees = can("fees.read");
  const [modal, setModal] = useState<ModalState>(null);

  const data = useQuery(async () => {
    const [student, enrollments] = await Promise.all([
      unwrap(supabase.from("students").select("*").eq("id", id).maybeSingle()),
      unwrap(supabase.from("enrollment_overview").select("*").eq("student_id", id).order("created_at", { ascending: false })),
    ]);
    const ids = enrollments.map((e) => e.id!);
    const [rows, installments, payments] = await Promise.all([
      unwrap(supabase.from("student_enrollments").select("*").in("id", ids)),
      fees ? unwrap(supabase.from("fee_installments").select("*").in("enrollment_id", ids).order("installment_no")) : Promise.resolve([] as InstallmentRow[]),
      fees ? unwrap(supabase.from("payment_ledger").select("*").in("enrollment_id", ids).order("payment_date", { ascending: false }).order("created_at", { ascending: false })) : Promise.resolve([] as LedgerRow[]),
    ]);
    return { student, enrollments, rows, installments, payments };
  }, [id, fees]);

  if (data.loading && !data.data) return <PageLoader />;
  if (data.error) return <ErrorState message={data.error.message} onRetry={data.reload} />;
  const student = data.data?.student;
  if (!student) {
    return <EmptyState title="Student not found" description="The record may not exist or you may not have access." action={<Link to="/admin/students">Back to students</Link>} />;
  }
  const { enrollments, rows, installments, payments } = data.data!;
  const whatsapp = student.mobile.replace(/\D/g, "");

  return (
    <>
      <Link to="/admin/students" className="back-link"><ArrowLeft size={14} aria-hidden /> All students</Link>
      <PageHeader
        title={student.full_name}
        description={`Student ID ${student.student_code} · registered ${formatDate(student.created_at)}`}
        actions={
          <>
            <a className="btn btn-secondary btn-md" href={`tel:${student.mobile}`}><Phone size={16} aria-hidden /> Call</a>
            <a className="btn btn-secondary btn-md" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden /> WhatsApp</a>
            <a className="btn btn-secondary btn-md" href={`mailto:${student.email}`}><Mail size={16} aria-hidden /> Email</a>
            {can("students.write") && <Button icon={<Pencil size={16} />} onClick={() => setModal({ type: "edit" })}>Edit</Button>}
          </>
        }
      />

      <section className="card">
        <dl className="detail-grid">
          <div><dt>Email</dt><dd>{student.email}</dd></div>
          <div><dt>Mobile</dt><dd>{student.mobile}</dd></div>
          <div><dt>Alternate mobile</dt><dd>{student.alt_mobile ?? "-"}</dd></div>
          <div><dt>Date of birth</dt><dd>{formatDate(student.date_of_birth)}</dd></div>
          <div><dt>Gender</dt><dd>{student.gender ? GENDER_LABELS[student.gender as Gender] : "-"}</dd></div>
          <div><dt>Address</dt><dd>{[student.address_line, student.city, student.state, student.postal_code].filter(Boolean).join(", ")}</dd></div>
          <div><dt>Qualification</dt><dd>{student.highest_qualification}</dd></div>
          <div><dt>Institution</dt><dd>{student.institution_name ?? "-"}</dd></div>
          <div><dt>Privacy consent</dt><dd>{formatDateTime(student.privacy_consent_at)}</dd></div>
        </dl>
      </section>

      <h2 className="section-title">Courses ({enrollments.length})</h2>
      {enrollments.map((e) => (
        <EnrollmentPanel
          key={e.id}
          enrollment={e}
          row={rows.find((r) => r.id === e.id)!}
          installments={installments.filter((i) => i.enrollment_id === e.id)}
          payments={payments.filter((p) => p.enrollment_id === e.id)}
          onAction={setModal}
        />
      ))}

      {modal?.type === "edit" && <EditStudentModal student={student} onClose={() => setModal(null)} onSaved={data.reload} />}
      {modal?.type === "status" && <StatusModal enrollment={modal.enrollment} onClose={() => setModal(null)} onSaved={data.reload} />}
      {modal?.type === "batch" && <BatchModal enrollment={modal.enrollment} onClose={() => setModal(null)} onSaved={data.reload} />}
      {modal?.type === "fees" && <FeeConfigModal enrollment={modal.enrollment} row={modal.row} onClose={() => setModal(null)} onSaved={data.reload} />}
      {modal?.type === "plan" && <InstallmentPlanModal enrollment={modal.enrollment} installments={modal.installments} onClose={() => setModal(null)} onSaved={data.reload} />}
      {(modal?.type === "payment" || modal?.type === "refund") && (
        <PaymentModal enrollment={modal.enrollment} mode={modal.type} onClose={() => setModal(null)} onSaved={data.reload} />
      )}
      {modal?.type === "void" && <VoidPaymentModal paymentId={modal.paymentId} label={modal.label} onClose={() => setModal(null)} onSaved={data.reload} />}
    </>
  );
}

function EnrollmentPanel({
  enrollment: e, row, installments, payments, onAction,
}: {
  enrollment: EnrollmentOverview;
  row: EnrollmentRow;
  installments: InstallmentRow[];
  payments: LedgerRow[];
  onAction: (m: ModalState) => void;
}) {
  const { can } = useAuth();
  const [menu, setMenu] = useState(false);
  const schedule = useInstallmentStatus(installments, e.net_paid);
  const closed = e.status === "rejected" || e.status === "withdrawn";
  const fees = can("fees.read");

  return (
    <section className="card enrollment-panel">
      <header className="enrollment-head">
        <div>
          <h3>{e.course_title}</h3>
          <div className="muted small">
            <span className="mono">{e.registration_no}</span> · applied {formatDate(e.created_at)}
            {e.batch_name && <> · {e.batch_name} (starts {formatDate(e.batch_start_date)})</>}
          </div>
        </div>
        <div className="enrollment-actions">
          <StatusBadge status={e.status} />
          {fees && <PaymentStatusBadge status={e.payment_status} />}
          {can("payments.record") && !closed && Number(e.balance) > 0 && (
            <Button size="sm" icon={<Plus size={14} />} onClick={() => onAction({ type: "payment", enrollment: e })}>Record payment</Button>
          )}
          <div className="menu-wrap">
            <Button variant="secondary" size="sm" icon={<MoreHorizontal size={16} />} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              Actions
            </Button>
            {menu && (
              <div className="menu" role="menu" onClick={() => setMenu(false)}>
                {can("admissions.manage") && <button role="menuitem" onClick={() => onAction({ type: "status", enrollment: e })}>Change status</button>}
                {can("admissions.manage") && <button role="menuitem" onClick={() => onAction({ type: "batch", enrollment: e })}>Change batch</button>}
                {can("fees.configure") && <button role="menuitem" onClick={() => onAction({ type: "fees", enrollment: e, row })}>Configure fees</button>}
                {can("fees.configure") && <button role="menuitem" onClick={() => onAction({ type: "plan", enrollment: e, installments })}>Edit installments</button>}
                {can("payments.adjust") && Number(e.net_paid) > 0 && <button role="menuitem" onClick={() => onAction({ type: "refund", enrollment: e })}>Record refund</button>}
              </div>
            )}
          </div>
        </div>
      </header>

      {e.student_message && <blockquote className="quote"><strong>Student message:</strong> {e.student_message}</blockquote>}

      {fees && (
        <>
          <div className="fee-strip">
            <div><span>Agreed fee</span><strong>{formatMoney(e.total_fee)}</strong></div>
            <div><span>Paid</span><strong className="text-success">{formatMoney(e.net_paid)}</strong></div>
            <div><span>Outstanding</span><strong className={Number(e.balance) > 0 ? "text-warning" : ""}>{formatMoney(e.balance)}</strong></div>
            <div><span>Next installment</span><strong>{e.next_due_date ? `${formatMoney(e.next_due_amount)} on ${formatDate(e.next_due_date)}` : "-"}</strong></div>
            {Number(e.overdue_amount) > 0 && <div><span>Overdue</span><strong className="text-danger">{formatMoney(e.overdue_amount)}</strong></div>}
          </div>
          <details className="fee-breakdown">
            <summary>Fee breakdown</summary>
            <table className="fee-table">
              <tbody>
                <tr><td>Tuition</td><td className="num">{formatMoney(row.tuition_fee)}</td></tr>
                <tr><td>Admission fee</td><td className="num">{formatMoney(row.admission_fee)}</td></tr>
                <tr><td>Registration fee</td><td className="num">{formatMoney(row.registration_fee)}</td></tr>
                <tr><td>Additional charges</td><td className="num">{formatMoney(row.additional_charges)}</td></tr>
                <tr><td>Discount</td><td className="num">- {formatMoney(row.discount)}</td></tr>
                <tr><td>Scholarship</td><td className="num">- {formatMoney(row.scholarship)}</td></tr>
                <tr className="total"><td>Total payable</td><td className="num">{formatMoney(row.total_fee)}</td></tr>
              </tbody>
            </table>
            {row.fee_remarks && <p className="muted small">Remarks: {row.fee_remarks}</p>}
          </details>

          <div className="two-col">
            <div>
              <h4><CalendarClock size={16} aria-hidden /> Installments</h4>
              {schedule.length === 0 ? (
                <p className="muted small">No installments.</p>
              ) : (
                <table className="table compact">
                  <thead><tr><th>#</th><th>Due</th><th className="num">Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {schedule.map((i) => (
                      <tr key={i.id}>
                        <td>{i.installment_no}{i.label ? ` · ${i.label}` : ""}</td>
                        <td>{formatDate(i.due_date)}</td>
                        <td className="num">{formatMoney(i.amount)}</td>
                        <td><PaymentStatusBadge status={closed && i.status === "overdue" ? "pending" : i.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <h4><Receipt size={16} aria-hidden /> Payment history</h4>
              {payments.length === 0 ? (
                <p className="muted small">No payments recorded yet.</p>
              ) : (
                <table className="table compact">
                  <thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th className="num">Amount</th><th /></tr></thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className={p.voided_at ? "voided" : ""}>
                        <td>{formatDate(p.payment_date)}</td>
                        <td>
                          {p.receipt_id ? <Link to={`/admin/receipts/${p.receipt_id}`} className="mono">{p.receipt_no}</Link> : "-"}
                          {p.kind === "refund" && <span className="badge badge-muted">Refund</span>}
                          {p.voided_at && <span className="badge badge-danger" title={p.void_reason ?? ""}>Void</span>}
                          {p.transaction_reference && <div className="muted small">Ref: {p.transaction_reference}</div>}
                        </td>
                        <td>{METHOD_LABELS[p.method as PaymentMethod]}</td>
                        <td className="num">{p.kind === "refund" ? "-" : ""}{formatMoney(p.amount)}</td>
                        <td>
                          {can("payments.adjust") && !p.voided_at && (
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label={`Void ${p.receipt_no}`}
                              title="Void"
                              onClick={() => onAction({ type: "void", paymentId: p.id!, label: `${p.receipt_no} · ${formatMoney(p.amount)}` })}
                            >
                              {p.kind === "refund" ? <Undo2 size={15} /> : <Ban size={15} />}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      <NotesTimeline enrollmentId={e.id!} />
    </section>
  );
}

const NOTE_TYPES = [
  { id: "note", label: "Note" },
  { id: "call", label: "Phone call" },
  { id: "email", label: "Email" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "meeting", label: "Meeting" },
] as const;

function NotesTimeline({ enrollmentId }: { enrollmentId: string }) {
  const { can, profile } = useAuth();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [type, setType] = useState<(typeof NOTE_TYPES)[number]["id"]>("note");
  const [busy, setBusy] = useState(false);
  const notes = useQuery(
    () => unwrap(supabase.from("admission_notes").select("*, author:admin_users(full_name)").eq("enrollment_id", enrollmentId).order("created_at", { ascending: false }).limit(50)),
    [enrollmentId],
  );

  const add = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    const { error } = await supabase.from("admission_notes").insert({ enrollment_id: enrollmentId, body: body.trim(), note_type: type, created_by: profile!.id });
    setBusy(false);
    if (error) toast(toAppError(error).message, "error");
    else {
      setBody("");
      notes.reload();
    }
  };

  return (
    <details className="notes" open={false}>
      <summary>Notes & activity ({notes.data?.length ?? 0})</summary>
      {can("notes.write") && (
        <form className="note-form" onSubmit={add}>
          <select aria-label="Note type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {NOTE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <input aria-label="Add an internal note" placeholder="Add an internal note..." maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
          <Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>Add</Button>
        </form>
      )}
      <ol className="timeline">
        {notes.data?.map((n) => (
          <li key={n.id} className={`timeline-${n.note_type}`}>
            <div className="timeline-meta">
              <strong>{n.author?.full_name ?? "System"}</strong> · {n.note_type.replace("_", " ")} · {formatDateTime(n.created_at)}
            </div>
            <p className="pre-line">{n.body}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}
