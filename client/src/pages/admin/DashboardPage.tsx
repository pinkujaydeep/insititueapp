import { useState } from "react";
import { Link } from "react-router";
import {
  AlertCircle, BookOpen, CalendarPlus, GraduationCap, IndianRupee, MessageSquare, RefreshCw, UserCheck, Users, Wallet,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { BarChart, Donut, HBarList, monthPoints } from "../../components/ui/Charts";
import { DateRangeFilter, presetRange, type DateRange } from "../../components/ui/DateRange";
import { ErrorState, SkeletonCards } from "../../components/ui/Feedback";
import { PageHeader, StatCard } from "../../components/ui/Layout";
import { useAuth } from "../../hooks/useAuth";
import { useQuery } from "../../hooks/useQuery";
import { unwrap } from "../../lib/errors";
import { ADMISSION_STATUSES, formatMoney, PAYMENT_STATUS_LABELS, STATUS_LABELS, type PaymentStatus } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { DashboardData } from "../../lib/types";

export default function DashboardPage() {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRange>(() => presetRange("last_12_months"));
  const { data, error, loading, reload } = useQuery(
    async () => (await unwrap(supabase.rpc("dashboard_summary", { p_from: range.from, p_to: range.to }))) as unknown as DashboardData,
    [range.from, range.to],
  );

  const c = data?.cards;
  const fees = data?.can_view_fees;
  const paidVsPending: PaymentStatus[] = ["paid", "partially_paid", "overdue", "pending"];

  return (
    <>
      <PageHeader
        title={`Welcome, ${profile?.full_name.split(" ")[0] ?? ""}`}
        description="Overview of admissions and fee collection, calculated from live records."
        actions={
          <>
            <DateRangeFilter value={range} onChange={setRange} />
            <Button variant="secondary" icon={<RefreshCw size={16} className={loading ? "spin" : ""} />} onClick={reload} disabled={loading}>
              Refresh
            </Button>
          </>
        }
      />
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {!data && loading && <SkeletonCards count={8} />}

      {data && c && (
        <div className={loading ? "is-refreshing" : ""}>
          <div className="stat-grid">
            <StatCard label="Registered students" value={c.total_students} icon={<Users size={18} />} />
            <StatCard label="Active students" value={c.active_students} icon={<UserCheck size={18} />} tone="success" hint="Enrolled in a running batch" />
            <StatCard label="Total enquiries" value={c.total_enquiries} icon={<MessageSquare size={18} />} hint="All applications received" />
            <StatCard label="Enrolled students" value={c.enrolled_students} icon={<GraduationCap size={18} />} tone="primary" />
            <StatCard label="Active courses" value={c.active_courses} icon={<BookOpen size={18} />} />
            <StatCard label="New this month" value={c.new_registrations_this_month} icon={<CalendarPlus size={18} />} />
            {fees && (
              <>
                <StatCard label="Fees collected" value={formatMoney(c.fees_collected)} icon={<IndianRupee size={18} />} tone="success" hint={`${formatMoney(c.period_collected)} in selected period`} />
                <StatCard label="Outstanding fees" value={formatMoney(c.outstanding)} icon={<Wallet size={18} />} tone="warning" hint={c.overdue ? `${formatMoney(c.overdue)} overdue` : "Nothing overdue"} />
              </>
            )}
          </div>

          <div className="dash-grid">
            <section className="card">
              <h2 className="card-title">Monthly registrations</h2>
              <BarChart data={monthPoints(data.monthly_registrations)} />
            </section>
            {fees && (
              <section className="card">
                <h2 className="card-title">Monthly fee collections</h2>
                <BarChart data={monthPoints(data.monthly_collections)} money />
              </section>
            )}
            <section className="card">
              <h2 className="card-title">Students by course</h2>
              <HBarList data={data.course_distribution.slice(0, 8).map((d) => ({ label: d.course, value: d.total }))} />
            </section>
            {fees && data.fee_status && (
              <section className="card">
                <h2 className="card-title">Paid vs pending fees</h2>
                <Donut
                  data={paidVsPending.map((s) => ({ label: PAYMENT_STATUS_LABELS[s], value: data.fee_status!.by_status[s]?.count ?? 0 }))}
                  centerLabel={`${Object.values(data.fee_status.by_status).reduce((n, v) => n + (v?.count ?? 0), 0)} students`}
                />
                <div className="split-figures">
                  <div><span className="muted small">Collected</span><strong className="text-success">{formatMoney(data.fee_status.collected)}</strong></div>
                  <div><span className="muted small">Outstanding</span><strong className="text-warning">{formatMoney(data.fee_status.outstanding)}</strong></div>
                </div>
              </section>
            )}
            <section className="card">
              <h2 className="card-title">Admission conversion</h2>
              <div className="conversion-head">
                <strong className="big-number">{data.conversion.rate}%</strong>
                <span className="muted small">
                  {data.conversion.enrolled} enrolled of {data.conversion.total} applications in this period
                </span>
              </div>
              <ul className="funnel">
                {ADMISSION_STATUSES.map((s) => {
                  const n = data.conversion.by_status[s] ?? 0;
                  const pct = data.conversion.total ? (n / data.conversion.total) * 100 : 0;
                  return (
                    <li key={s}>
                      <Link to={`/admin/students?status=${s}`}>{STATUS_LABELS[s]}</Link>
                      <div className="hbar-track"><div className={`hbar-fill status-${s}`} style={{ width: `${pct}%` }} /></div>
                      <strong>{n}</strong>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
          {fees && Number(c.overdue) > 0 && (
            <Link to="/admin/reports?tab=overdue" className="alert alert-warning alert-link">
              <AlertCircle size={16} aria-hidden /> {formatMoney(c.overdue)} in fees is overdue. View the overdue report →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
