import type { Database } from "./database.types";

type E = Database["public"]["Enums"];
export type AdmissionStatus = E["admission_status"];
export type PaymentMethod = E["payment_method"];
export type AppRole = E["app_role"];
export type CourseStatus = E["course_status"];
export type CourseLevel = E["course_level"];
export type DurationUnit = E["duration_unit"];
export type Gender = E["gender"];
export type BatchMode = E["batch_mode"];
export type PaymentStatus = "paid" | "partially_paid" | "pending" | "overdue" | "refunded";

let currency = "INR";
const LOCALE = "en-IN";

export function setCurrency(code: string) {
  currency = code || "INR";
}

export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

export function formatCompactMoney(value: number): string {
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return d.toLocaleDateString(LOCALE, { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString(LOCALE, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export const ADMISSION_STATUSES: AdmissionStatus[] = [
  "new_enquiry", "contacted", "application_submitted", "under_review", "approved", "enrolled", "rejected", "withdrawn",
];
export const STATUS_LABELS: Record<AdmissionStatus, string> = {
  new_enquiry: "New Enquiry",
  contacted: "Contacted",
  application_submitted: "Application Submitted",
  under_review: "Under Review",
  approved: "Approved",
  enrolled: "Enrolled",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const PAYMENT_METHODS: PaymentMethod[] = ["upi", "cash", "bank_transfer", "card", "cheque", "other"];
export const METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Paid",
  partially_paid: "Partially Paid",
  pending: "Pending",
  overdue: "Overdue",
  refunded: "Refunded",
};

export const ROLES: AppRole[] = ["super_admin", "administrator", "accounts_staff", "admissions_staff"];
export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  administrator: "Administrator",
  accounts_staff: "Accounts Staff",
  admissions_staff: "Admissions Staff",
};

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  all_levels: "All levels",
};

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  draft: "Draft",
  published: "Published",
  inactive: "Inactive",
};

export const MODE_LABELS: Record<BatchMode, string> = { classroom: "Classroom", online: "Online", hybrid: "Hybrid" };

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

export function formatDuration(value: number, unit: DurationUnit): string {
  const singular = unit.replace(/s$/, "");
  return `${value} ${value === 1 ? singular : unit}`;
}
