import { useState } from "react";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/Feedback";
import { PageHeader, Pagination } from "../../components/ui/Layout";
import { useQuery } from "../../hooks/useQuery";
import { formatDateTime } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { AuditRow } from "../../lib/types";

const PAGE_SIZE = 30;
const TABLES = [
  "students", "student_enrollments", "fee_payments", "payment_receipts", "fee_installments", "courses", "fee_structures",
  "batches", "course_categories", "user_roles", "admin_users", "institute_settings", "auth.users",
];

function changedFields(row: AuditRow): string {
  if (row.action !== "UPDATE" || !row.old_data || !row.new_data) return "";
  const oldD = row.old_data as Record<string, unknown>;
  const newD = row.new_data as Record<string, unknown>;
  return Object.keys(newD)
    .filter((k) => k !== "updated_at" && JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]))
    .join(", ");
}

export default function AuditLogPage() {
  const [table, setTable] = useState("");
  const [page, setPage] = useState(1);
  const logs = useQuery(async () => {
    let q = supabase.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (table) q = q.eq("table_name", table);
    const start = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await q.range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    return { rows: data ?? [], count: count ?? 0 };
  }, [table, page]);

  return (
    <>
      <PageHeader title="Audit log" description="Every change to students, admissions, fees, courses, users and settings." />
      <div className="card filter-bar">
        <select aria-label="Table" value={table} onChange={(e) => { setTable(e.target.value); setPage(1); }}>
          <option value="">All records</option>
          {TABLES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
      </div>
      {logs.error && <ErrorState message={logs.error.message} onRetry={logs.reload} />}
      <div className="card table-card">
        {logs.loading && !logs.data ? <SkeletonRows rows={8} cols={4} /> : logs.data?.rows.length === 0 ? <EmptyState title="No audit entries" /> : (
          <div className="table-wrap">
            <table className="table responsive-table compact">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
              <tbody>
                {logs.data?.rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="When">{formatDateTime(r.created_at)}</td>
                    <td data-label="Who">{r.actor_email ?? <span className="muted">System / public</span>}</td>
                    <td data-label="Action"><span className={`badge badge-${r.action === "DELETE" ? "danger" : r.action === "INSERT" ? "success" : "info"}`}>{r.action}</span></td>
                    <td data-label="Record">{r.table_name.replace(/_/g, " ")}<div className="muted small mono">{r.record_id?.slice(0, 8)}</div></td>
                    <td data-label="Details">
                      <details>
                        <summary className="small">{changedFields(r) || "View data"}</summary>
                        <pre className="json">{JSON.stringify(r.action === "DELETE" ? r.old_data : r.new_data, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={logs.data?.count ?? 0} onPage={setPage} />
      </div>
    </>
  );
}
