import type { ReactNode } from "react";
import {
  PAYMENT_STATUS_LABELS, ROLE_LABELS, STATUS_LABELS, type AdmissionStatus, type AppRole, type PaymentStatus,
} from "../../lib/format";

const STATUS_TONE: Record<AdmissionStatus, string> = {
  new_enquiry: "info",
  contacted: "info",
  application_submitted: "neutral",
  under_review: "warning",
  approved: "success",
  enrolled: "primary",
  rejected: "danger",
  withdrawn: "muted",
};

const PAYMENT_TONE: Record<PaymentStatus, string> = {
  paid: "success",
  partially_paid: "warning",
  pending: "neutral",
  overdue: "danger",
  refunded: "muted",
};

export function Badge({ tone = "neutral", children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: AdmissionStatus | string | null | undefined }) {
  if (!status) return null;
  const s = status as AdmissionStatus;
  return <Badge tone={STATUS_TONE[s] ?? "neutral"}>{STATUS_LABELS[s] ?? status}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const s = status as PaymentStatus;
  return <Badge tone={PAYMENT_TONE[s] ?? "neutral"}>{PAYMENT_STATUS_LABELS[s] ?? status}</Badge>;
}

export function RoleBadge({ role }: { role: AppRole }) {
  return <Badge tone={role === "super_admin" ? "primary" : "info"}>{ROLE_LABELS[role]}</Badge>;
}
