import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Download, Search, X } from "lucide-react";
import { PaymentStatusBadge, StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/Feedback";
import { PageHeader, Pagination } from "../../components/ui/Layout";
import { useToast } from "../../components/ui/FeedbackProvider";
import { useAuth } from "../../hooks/useAuth";
import { useDebounced, useQuery } from "../../hooks/useQuery";
import { downloadCsv } from "../../lib/csv";
import { toAppError, unwrap } from "../../lib/errors";
import {
  ADMISSION_STATUSES, formatDate, formatMoney, PAYMENT_STATUS_LABELS, STATUS_LABELS, type AdmissionStatus, type PaymentStatus,
} from "../../lib/format";
import { dayEnd, dayStart, ilikeAny } from "../../lib/query";
import { supabase } from "../../lib/supabase";
import type { EnrollmentOverview } from "../../lib/types";

const PAGE_SIZE = 20;
const SEARCH_COLUMNS = ["full_name", "email", "mobile", "registration_no", "student_code"];

export default function StudentsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const fees = can("fees.read");
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const search = useDebounced(searchInput);
  const [exporting, setExporting] = useState(false);

  const filters = {
    q: params.get("q") ?? "",
    status: params.get("status") ?? "",
    course: params.get("course") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    payment: params.get("payment") ?? "",
    page: Math.max(1, Number(params.get("page") ?? 1)),
  };

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (search !== filters.q) setFilter("q", search);
  }, [search]);

  const courses = useQuery(
    () => unwrap(supabase.from("courses").select("id, code, title").order("title")),
    [],
  );

  const buildQuery = (withCount: boolean) => {
    let q = supabase.from("enrollment_overview").select("*", withCount ? { count: "exact" } : undefined);
    const or = ilikeAny(filters.q, SEARCH_COLUMNS);
    if (or) q = q.or(or);
    if (filters.status) q = q.eq("status", filters.status as AdmissionStatus);
    if (filters.course) q = q.eq("course_id", filters.course);
    if (filters.from) q = q.gte("created_at", dayStart(filters.from));
    if (filters.to) q = q.lt("created_at", dayEnd(filters.to));
    if (filters.payment && fees) q = q.eq("payment_status", filters.payment);
    return q.order("created_at", { ascending: false });
  };

  const list = useQuery(async () => {
    const start = (filters.page - 1) * PAGE_SIZE;
    const { data, count, error } = await buildQuery(true).range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    return { rows: data ?? [], count: count ?? 0 };
  }, [filters.q, filters.status, filters.course, filters.from, filters.to, filters.payment, filters.page]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await unwrap(buildQuery(false).limit(5000));
      const headers = ["Registration No", "Student ID", "Name", "Email", "Mobile", "City", "Course", "Batch", "Status", "Registered On"];
      if (fees) headers.push("Total Fee", "Paid", "Balance", "Payment Status");
      downloadCsv(
        `students-${new Date().toISOString().slice(0, 10)}`,
        headers,
        rows.map((r: EnrollmentOverview) => [
          r.registration_no, r.student_code, r.full_name, r.email, r.mobile, r.city, r.course_title, r.batch_name,
          STATUS_LABELS[r.status as AdmissionStatus], formatDate(r.created_at),
          ...(fees ? [r.total_fee, r.net_paid, r.balance, PAYMENT_STATUS_LABELS[r.payment_status as PaymentStatus]] : []),
        ]),
      );
    } catch (err) {
      toast(toAppError(err).message, "error");
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = Boolean(filters.q || filters.status || filters.course || filters.from || filters.to || filters.payment);

  return (
    <>
      <PageHeader
        title="Students & Admissions"
        description="All applications received, with admission status and fee position."
        actions={<Button variant="secondary" icon={<Download size={16} />} loading={exporting} onClick={exportCsv}>Export CSV</Button>}
      />

      <div className="card filter-bar">
        <label className="search-box">
          <Search size={16} aria-hidden />
          <span className="sr-only">Search students</span>
          <input
            type="search"
            placeholder="Name, mobile, email or registration no."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
        <select aria-label="Filter by course" value={filters.course} onChange={(e) => setFilter("course", e.target.value)}>
          <option value="">All courses</option>
          {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select aria-label="Filter by admission status" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">All statuses</option>
          {ADMISSION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        {fees && (
          <select aria-label="Filter by payment status" value={filters.payment} onChange={(e) => setFilter("payment", e.target.value)}>
            <option value="">Any fee status</option>
            {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>)}
          </select>
        )}
        <div className="inline-dates">
          <input type="date" aria-label="Registered from" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilter("from", e.target.value)} />
          <span className="muted small">to</span>
          <input type="date" aria-label="Registered to" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter("to", e.target.value)} />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => { setSearchInput(""); setParams({}, { replace: true }); }}>
            Clear
          </Button>
        )}
      </div>

      {list.error && <ErrorState message={list.error.message} onRetry={list.reload} />}
      <div className={`card table-card${list.loading && list.data ? " is-refreshing" : ""}`}>
        {list.loading && !list.data ? (
          <SkeletonRows rows={8} cols={6} />
        ) : list.data && list.data.rows.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No students match these filters" : "No registrations yet"}
            description={hasFilters ? "Try clearing some filters." : "Applications submitted on the website will appear here."}
          />
        ) : (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Registration</th>
                  <th>Course</th>
                  <th>Status</th>
                  {fees && <th className="num">Balance</th>}
                  {fees && <th>Fees</th>}
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Student">
                      <Link to={`/admin/students/${r.student_id}`} className="strong-link">{r.full_name}</Link>
                      <div className="muted small">{r.mobile} · {r.email}</div>
                    </td>
                    <td data-label="Registration">
                      <span className="mono">{r.registration_no}</span>
                      <div className="muted small mono">{r.student_code}</div>
                    </td>
                    <td data-label="Course">
                      {r.course_title}
                      {r.batch_name && <div className="muted small">{r.batch_name}</div>}
                    </td>
                    <td data-label="Status"><StatusBadge status={r.status} /></td>
                    {fees && <td data-label="Balance" className="num">{formatMoney(r.balance)}</td>}
                    {fees && <td data-label="Fees"><PaymentStatusBadge status={r.payment_status} /></td>}
                    <td data-label="Registered">{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={filters.page} pageSize={PAGE_SIZE} total={list.data?.count ?? 0} onPage={(p) => setFilter("page", String(p))} />
      </div>
    </>
  );
}
