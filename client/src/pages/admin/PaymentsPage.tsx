import { useState } from "react";
import { Link } from "react-router";
import { Download, Plus, Search } from "lucide-react";
import { PaymentStatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DateRangeFilter, presetRange, type DateRange } from "../../components/ui/DateRange";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/FeedbackProvider";
import { PageHeader, Pagination, StatCard } from "../../components/ui/Layout";
import { Modal } from "../../components/ui/Modal";
import { useAuth } from "../../hooks/useAuth";
import { useDebounced, useQuery } from "../../hooks/useQuery";
import { downloadCsv } from "../../lib/csv";
import { toAppError, unwrap } from "../../lib/errors";
import { formatDate, formatMoney, METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from "../../lib/format";
import { fromPaise, subtractMoney, toPaise } from "../../lib/money";
import { ilikeAny } from "../../lib/query";
import { supabase } from "../../lib/supabase";
import type { EnrollmentOverview, LedgerRow } from "../../lib/types";
import { PaymentModal } from "./EnrollmentModals";

const PAGE_SIZE = 25;

export default function PaymentsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [range, setRange] = useState<DateRange>(() => presetRange("this_month"));
  const [method, setMethod] = useState("");
  const [course, setCourse] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState<EnrollmentOverview | null>(null);

  const courses = useQuery(() => unwrap(supabase.from("courses").select("id, title").order("title")), []);

  const base = (cols: string, count = false) => {
    let q = supabase.from("payment_ledger").select(cols, count ? { count: "exact" } : undefined)
      .gte("payment_date", range.from).lte("payment_date", range.to);
    if (method) q = q.eq("method", method as PaymentMethod);
    if (course) q = q.eq("course_id", course);
    if (kind) q = q.eq("kind", kind as "payment" | "refund");
    return q;
  };

  const list = useQuery(async () => {
    const start = (page - 1) * PAGE_SIZE;
    const [pageRes, totals] = await Promise.all([
      base("*", true).order("payment_date", { ascending: false }).order("created_at", { ascending: false }).range(start, start + PAGE_SIZE - 1),
      unwrap(base("amount, kind, voided_at").limit(10000)),
    ]);
    if (pageRes.error) throw pageRes.error;
    let collected = 0;
    let refunded = 0;
    for (const t of totals as unknown as { amount: number; kind: string; voided_at: string | null }[]) {
      if (t.voided_at) continue;
      if (t.kind === "refund") refunded += toPaise(t.amount);
      else collected += toPaise(t.amount);
    }
    return { rows: (pageRes.data ?? []) as unknown as LedgerRow[], count: pageRes.count ?? 0, collected: fromPaise(collected), refunded: fromPaise(refunded) };
  }, [range.from, range.to, method, course, kind, page]);

  const exportCsv = async () => {
    try {
      const rows = (await unwrap(base("*").order("payment_date").limit(10000))) as unknown as LedgerRow[];
      downloadCsv(`payments-${range.from}-to-${range.to}`,
        ["Date", "Receipt No", "Type", "Student", "Student ID", "Registration No", "Course", "Method", "Reference", "Amount", "Status", "Recorded By", "Remarks"],
        rows.map((r) => [r.payment_date, r.receipt_no, r.kind, r.student_name, r.student_code, r.registration_no, r.course_title,
          METHOD_LABELS[r.method as PaymentMethod], r.transaction_reference, r.amount, r.voided_at ? "Void" : "Valid", r.recorded_by_name, r.remarks]));
    } catch (err) {
      toast(toAppError(err).message, "error");
    }
  };

  const update = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  return (
    <>
      <PageHeader
        title="Fee Collection"
        description="Every payment and refund recorded, with receipts."
        actions={
          <>
            <Button variant="secondary" icon={<Download size={16} />} onClick={exportCsv}>Export CSV</Button>
            {can("payments.record") && <Button icon={<Plus size={16} />} onClick={() => setPicking(true)}>Record payment</Button>}
          </>
        }
      />
      <div className="card filter-bar">
        <DateRangeFilter value={range} onChange={update(setRange)} />
        <select aria-label="Payment method" value={method} onChange={(e) => update(setMethod)(e.target.value)}>
          <option value="">All methods</option>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
        </select>
        <select aria-label="Course" value={course} onChange={(e) => update(setCourse)(e.target.value)}>
          <option value="">All courses</option>
          {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select aria-label="Entry type" value={kind} onChange={(e) => update(setKind)(e.target.value)}>
          <option value="">Payments & refunds</option>
          <option value="payment">Payments only</option>
          <option value="refund">Refunds only</option>
        </select>
      </div>

      {list.data && (
        <div className="stat-grid stat-grid-3">
          <StatCard label="Collected" value={formatMoney(list.data.collected)} tone="success" />
          <StatCard label="Refunded" value={formatMoney(list.data.refunded)} tone="danger" />
          <StatCard label="Net collection" value={formatMoney(subtractMoney(list.data.collected, list.data.refunded))} tone="primary" />
        </div>
      )}

      {list.error && <ErrorState message={list.error.message} onRetry={list.reload} />}
      <div className={`card table-card${list.loading && list.data ? " is-refreshing" : ""}`}>
        {list.loading && !list.data ? (
          <SkeletonRows rows={8} cols={6} />
        ) : list.data?.rows.length === 0 ? (
          <EmptyState title="No payments in this period" description="Change the date range or filters." />
        ) : (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr><th>Date</th><th>Receipt</th><th>Student</th><th>Course</th><th>Method</th><th className="num">Amount</th><th>Recorded by</th></tr>
              </thead>
              <tbody>
                {list.data?.rows.map((r) => (
                  <tr key={r.id} className={r.voided_at ? "voided" : ""}>
                    <td data-label="Date">{formatDate(r.payment_date)}</td>
                    <td data-label="Receipt">
                      {r.receipt_id ? <Link className="mono" to={`/admin/receipts/${r.receipt_id}`}>{r.receipt_no}</Link> : "-"}
                      {r.kind === "refund" && <span className="badge badge-muted">Refund</span>}
                      {r.voided_at && <span className="badge badge-danger">Void</span>}
                    </td>
                    <td data-label="Student">
                      <Link to={`/admin/students/${r.student_id}`}>{r.student_name}</Link>
                      <div className="muted small mono">{r.registration_no}</div>
                    </td>
                    <td data-label="Course">{r.course_title}</td>
                    <td data-label="Method">
                      {METHOD_LABELS[r.method as PaymentMethod]}
                      {r.transaction_reference && <div className="muted small">{r.transaction_reference}</div>}
                    </td>
                    <td data-label="Amount" className="num">{r.kind === "refund" ? "-" : ""}{formatMoney(r.amount)}</td>
                    <td data-label="Recorded by" className="small">{r.recorded_by_name ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.count ?? 0} onPage={setPage} />
      </div>

      {picking && <EnrollmentPicker onClose={() => setPicking(false)} onPick={(e) => { setPicking(false); setPaying(e); }} />}
      {paying && <PaymentModal enrollment={paying} onClose={() => setPaying(null)} onSaved={list.reload} />}
    </>
  );
}

function EnrollmentPicker({ onClose, onPick }: { onClose: () => void; onPick: (e: EnrollmentOverview) => void }) {
  const [term, setTerm] = useState("");
  const search = useDebounced(term);
  const results = useQuery(async () => {
    const or = ilikeAny(search, ["full_name", "mobile", "email", "registration_no", "student_code"]);
    if (!or) return [];
    return unwrap(
      supabase.from("enrollment_overview").select("*").or(or).gt("balance", 0)
        .not("status", "in", "(rejected,withdrawn)").order("created_at", { ascending: false }).limit(15),
    );
  }, [search]);

  return (
    <Modal title="Record payment" description="Find the student's registration" onClose={onClose}>
      <label className="search-box">
        <Search size={16} aria-hidden />
        <span className="sr-only">Search</span>
        <input autoFocus placeholder="Name, mobile, registration no. or student ID" value={term} onChange={(e) => setTerm(e.target.value)} />
      </label>
      <ul className="picker-list">
        {results.loading && search && <li className="muted small">Searching...</li>}
        {!results.loading && search && results.data?.length === 0 && <li className="muted small">No registrations with an outstanding balance match.</li>}
        {results.data?.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e)}>
              <div>
                <strong>{e.full_name}</strong> <span className="muted small mono">{e.registration_no}</span>
                <div className="muted small">{e.course_title} · {e.mobile}</div>
              </div>
              <div className="picker-right">
                <span>{formatMoney(e.balance)}</span>
                <PaymentStatusBadge status={e.payment_status} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
