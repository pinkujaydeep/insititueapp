import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Download } from "lucide-react";
import { PaymentStatusBadge, StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { BarChart } from "../../components/ui/Charts";
import { DateRangeFilter, presetRange, type DateRange } from "../../components/ui/DateRange";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/Feedback";
import { PageHeader, Tabs } from "../../components/ui/Layout";
import { useQuery } from "../../hooks/useQuery";
import { downloadCsv } from "../../lib/csv";
import { unwrap } from "../../lib/errors";
import { formatDate, formatMoney, METHOD_LABELS, STATUS_LABELS, type AdmissionStatus, type PaymentMethod } from "../../lib/format";
import { sumMoney } from "../../lib/money";
import { supabase } from "../../lib/supabase";

type Tab = "collections" | "courses" | "outstanding" | "overdue" | "methods";
type Period = "day" | "week" | "month" | "year";

const TABS: { id: Tab; label: string }[] = [
  { id: "collections", label: "Collections" },
  { id: "courses", label: "Course revenue" },
  { id: "outstanding", label: "Outstanding fees" },
  { id: "overdue", label: "Overdue payments" },
  { id: "methods", label: "Payment methods" },
];

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "collections") as Tab;
  const [range, setRange] = useState<DateRange>(() => presetRange("this_month"));
  const [period, setPeriod] = useState<Period>("day");

  return (
    <>
      <PageHeader title="Financial reports" description="All figures are calculated from recorded payments. Voided entries are excluded." />
      <Tabs tabs={TABS} value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} />
      {(tab === "collections" || tab === "courses" || tab === "methods") && (
        <div className="card filter-bar">
          <DateRangeFilter value={range} onChange={setRange} />
          {tab === "collections" && (
            <select aria-label="Group by" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
          )}
        </div>
      )}
      {tab === "collections" && <CollectionsReport range={range} period={period} />}
      {tab === "courses" && <CourseRevenueReport range={range} />}
      {tab === "outstanding" && <OutstandingReport overdueOnly={false} />}
      {tab === "overdue" && <OutstandingReport overdueOnly />}
      {tab === "methods" && <MethodsReport range={range} />}
    </>
  );
}

function ReportShell({ loading, error, onRetry, empty, onExport, children }: {
  loading: boolean; error: string | null; onRetry: () => void; empty: boolean; onExport: () => void; children: React.ReactNode;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  return (
    <div className="card table-card">
      <div className="table-toolbar">
        <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={onExport} disabled={loading || empty}>
          Export CSV (Excel)
        </Button>
      </div>
      {loading ? <SkeletonRows rows={6} cols={5} /> : empty ? <EmptyState title="No data for this selection" /> : children}
    </div>
  );
}

function CollectionsReport({ range, period }: { range: DateRange; period: Period }) {
  const q = useQuery(
    () => unwrap(supabase.rpc("report_collections", { p_from: range.from, p_to: range.to, p_period: period })),
    [range.from, range.to, period],
  );
  const rows = q.data ?? [];
  const totals = {
    count: rows.reduce((n, r) => n + Number(r.payments_count), 0),
    collected: sumMoney(rows.map((r) => r.collected)),
    refunded: sumMoney(rows.map((r) => r.refunded)),
    net: sumMoney(rows.map((r) => r.net)),
  };
  const nonZero = rows.filter((r) => Number(r.payments_count) > 0 || Number(r.refunded) > 0);

  return (
    <>
      {rows.length > 1 && rows.length <= 62 && (
        <section className="card">
          <BarChart data={rows.map((r) => ({ label: r.period_label.replace("Week of ", ""), value: Number(r.net) }))} money />
        </section>
      )}
      <ReportShell
        loading={q.loading} error={q.error?.message ?? null} onRetry={q.reload} empty={rows.length === 0}
        onExport={() => downloadCsv(`collections-${period}-${range.from}-to-${range.to}`, ["Period", "Payments", "Collected", "Refunded", "Net"],
          [...rows.map((r) => [r.period_label, r.payments_count, r.collected, r.refunded, r.net]), ["Total", totals.count, totals.collected, totals.refunded, totals.net]])}
      >
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Period</th><th className="num">Payments</th><th className="num">Collected</th><th className="num">Refunded</th><th className="num">Net</th></tr></thead>
            <tbody>
              {(period === "day" ? nonZero : rows).map((r) => (
                <tr key={r.period_start}>
                  <td>{r.period_label}</td>
                  <td className="num">{r.payments_count}</td>
                  <td className="num">{formatMoney(r.collected)}</td>
                  <td className="num">{formatMoney(r.refunded)}</td>
                  <td className="num"><strong>{formatMoney(r.net)}</strong></td>
                </tr>
              ))}
              {period === "day" && nonZero.length === 0 && <tr><td colSpan={5} className="muted">No collections on any day in this range.</td></tr>}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td className="num">{totals.count}</td><td className="num">{formatMoney(totals.collected)}</td><td className="num">{formatMoney(totals.refunded)}</td><td className="num">{formatMoney(totals.net)}</td></tr>
            </tfoot>
          </table>
        </div>
      </ReportShell>
    </>
  );
}

function CourseRevenueReport({ range }: { range: DateRange }) {
  const q = useQuery(() => unwrap(supabase.rpc("report_course_revenue", { p_from: range.from, p_to: range.to })), [range.from, range.to]);
  const rows = q.data ?? [];
  return (
    <ReportShell
      loading={q.loading} error={q.error?.message ?? null} onRetry={q.reload} empty={rows.length === 0}
      onExport={() => downloadCsv(`course-revenue-${range.from}-to-${range.to}`,
        ["Course Code", "Course", "Registrations (period)", "Approved/Enrolled", "Billed", "Collected (all time)", "Collected (period)", "Outstanding"],
        rows.map((r) => [r.course_code, r.course_title, r.registrations, r.billable_enrollments, r.billed, r.collected_total, r.collected_in_period, r.outstanding]))}
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Course</th><th className="num">New registrations</th><th className="num">Approved / enrolled</th><th className="num">Billed</th><th className="num">Collected in period</th><th className="num">Collected (all time)</th><th className="num">Outstanding</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.course_id}>
                <td>{r.course_title} <span className="muted small">{r.course_code}</span></td>
                <td className="num">{r.registrations}</td>
                <td className="num">{r.billable_enrollments}</td>
                <td className="num">{formatMoney(r.billed)}</td>
                <td className="num">{formatMoney(r.collected_in_period)}</td>
                <td className="num">{formatMoney(r.collected_total)}</td>
                <td className="num">{formatMoney(r.outstanding)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num">{rows.reduce((n, r) => n + Number(r.registrations), 0)}</td>
              <td className="num">{rows.reduce((n, r) => n + Number(r.billable_enrollments), 0)}</td>
              <td className="num">{formatMoney(sumMoney(rows.map((r) => r.billed)))}</td>
              <td className="num">{formatMoney(sumMoney(rows.map((r) => r.collected_in_period)))}</td>
              <td className="num">{formatMoney(sumMoney(rows.map((r) => r.collected_total)))}</td>
              <td className="num">{formatMoney(sumMoney(rows.map((r) => r.outstanding)))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportShell>
  );
}

function OutstandingReport({ overdueOnly }: { overdueOnly: boolean }) {
  const [course, setCourse] = useState("");
  const courses = useQuery(() => unwrap(supabase.from("courses").select("id, title").order("title")), []);
  const q = useQuery(
    () => unwrap(supabase.rpc("report_outstanding", { p_course_id: course || undefined, p_overdue_only: overdueOnly })),
    [course, overdueOnly],
  );
  const rows = q.data ?? [];
  return (
    <>
      <div className="card filter-bar">
        <select aria-label="Course" value={course} onChange={(e) => setCourse(e.target.value)}>
          <option value="">All courses</option>
          {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <span className="muted small">Approved and enrolled students with a balance. {overdueOnly ? "Only installments past their due date." : ""}</span>
      </div>
      <ReportShell
        loading={q.loading} error={q.error?.message ?? null} onRetry={q.reload} empty={rows.length === 0}
        onExport={() => downloadCsv(overdueOnly ? "overdue-payments" : "outstanding-fees",
          ["Registration No", "Student ID", "Student", "Mobile", "Email", "Course", "Batch", "Status", "Total Fee", "Paid", "Balance", "Next Due", "Overdue Amount", "Days Overdue"],
          rows.map((r) => [r.registration_no, r.student_code, r.student_name, r.mobile, r.email, r.course_title, r.batch_name,
            STATUS_LABELS[r.status as AdmissionStatus], r.total_fee, r.net_paid, r.balance, r.next_due_date, r.overdue_amount, r.days_overdue]))}
      >
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr><th>Student</th><th>Course</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th>
                {overdueOnly ? <><th className="num">Overdue</th><th>Since</th></> : <th>Next due</th>}<th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.enrollment_id}>
                  <td data-label="Student">
                    <Link to={`/admin/students/${r.student_id}`}>{r.student_name}</Link>
                    <div className="muted small">{r.mobile} · <span className="mono">{r.registration_no}</span></div>
                  </td>
                  <td data-label="Course">{r.course_title}<div className="muted small"><StatusBadge status={r.status} /></div></td>
                  <td data-label="Total" className="num">{formatMoney(r.total_fee)}</td>
                  <td data-label="Paid" className="num">{formatMoney(r.net_paid)}</td>
                  <td data-label="Balance" className="num"><strong>{formatMoney(r.balance)}</strong></td>
                  {overdueOnly ? (
                    <>
                      <td data-label="Overdue" className="num text-danger">{formatMoney(r.overdue_amount)}</td>
                      <td data-label="Since">{formatDate(r.oldest_overdue_date)} <span className="muted small">({r.days_overdue} days)</span></td>
                    </>
                  ) : (
                    <td data-label="Next due">{formatDate(r.next_due_date)}</td>
                  )}
                  <td data-label="Fee status"><PaymentStatusBadge status={r.payment_status} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total ({rows.length} students)</td>
                <td className="num">{formatMoney(sumMoney(rows.map((r) => r.balance)))}</td>
                {overdueOnly && <td className="num">{formatMoney(sumMoney(rows.map((r) => r.overdue_amount)))}</td>}
                <td colSpan={overdueOnly ? 2 : 2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </ReportShell>
    </>
  );
}

function MethodsReport({ range }: { range: DateRange }) {
  const q = useQuery(() => unwrap(supabase.rpc("report_payment_methods", { p_from: range.from, p_to: range.to })), [range.from, range.to]);
  const rows = q.data ?? [];
  const label = (m: string) => METHOD_LABELS[m as PaymentMethod] ?? m;
  return (
    <ReportShell
      loading={q.loading} error={q.error?.message ?? null} onRetry={q.reload} empty={rows.length === 0}
      onExport={() => downloadCsv(`payment-methods-${range.from}-to-${range.to}`, ["Method", "Payments", "Collected", "Refunded", "Net"],
        rows.map((r) => [label(r.method), r.payments_count, r.collected, r.refunded, r.net]))}
    >
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Method</th><th className="num">Payments</th><th className="num">Collected</th><th className="num">Refunded</th><th className="num">Net</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.method}>
                <td>{label(r.method)}</td>
                <td className="num">{r.payments_count}</td>
                <td className="num">{formatMoney(r.collected)}</td>
                <td className="num">{formatMoney(r.refunded)}</td>
                <td className="num"><strong>{formatMoney(r.net)}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num">{rows.reduce((n, r) => n + Number(r.payments_count), 0)}</td>
              <td className="num">{formatMoney(sumMoney(rows.map((r) => r.collected)))}</td>
              <td className="num">{formatMoney(sumMoney(rows.map((r) => r.refunded)))}</td>
              <td className="num">{formatMoney(sumMoney(rows.map((r) => r.net)))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportShell>
  );
}
