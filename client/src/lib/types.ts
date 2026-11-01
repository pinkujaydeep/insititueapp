import type { Database } from "./database.types";
import type { AdmissionStatus, AppRole, BatchMode, CourseLevel, DurationUnit, PaymentStatus } from "./format";

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];

export type InstituteSettings = Tables["institute_settings"]["Row"];
export type CourseRow = Tables["courses"]["Row"];
export type CategoryRow = Tables["course_categories"]["Row"];
export type BatchRow = Tables["batches"]["Row"];
export type FeeStructureRow = Tables["fee_structures"]["Row"];
export type StudentRow = Tables["students"]["Row"];
export type EnrollmentRow = Tables["student_enrollments"]["Row"];
export type InstallmentRow = Tables["fee_installments"]["Row"];
export type ReceiptRow = Tables["payment_receipts"]["Row"];
export type AdminUserRow = Tables["admin_users"]["Row"];
export type AuditRow = Tables["audit_logs"]["Row"];
export type EnrollmentOverview = Views["enrollment_overview"]["Row"];
export type LedgerRow = Views["payment_ledger"]["Row"];

export type Permission =
  | "courses.manage"
  | "students.read"
  | "students.write"
  | "admissions.manage"
  | "notes.write"
  | "fees.read"
  | "fees.configure"
  | "payments.record"
  | "payments.adjust"
  | "reports.view"
  | "users.manage"
  | "settings.manage"
  | "audit.read";

export interface StaffProfile {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  roles: AppRole[];
  permissions: Permission[];
}

export interface PublicBatch {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  schedule: string | null;
  mode: BatchMode;
  seats_left: number | null;
}

export interface PublicCourse {
  id: string;
  code: string;
  title: string;
  category_id: string | null;
  category_name: string | null;
  short_description: string;
  description: string;
  eligibility: string | null;
  level: CourseLevel;
  duration_value: number;
  duration_unit: DurationUnit;
  image_path: string | null;
  highlights: string[];
  is_featured: boolean;
  tuition_fee: number;
  admission_fee: number;
  registration_fee: number;
  total_fee: number;
  installment_count: number;
  seats_left: number | null;
  batches: PublicBatch[];
}

export interface PublicCatalog {
  categories: { id: string; name: string; slug: string }[];
  courses: PublicCourse[];
}

export interface RegistrationResult {
  registration_no: string;
  student_code: string;
  full_name: string;
  course_title: string;
  batch_name: string | null;
  total_fee: number;
  submitted_at: string;
  replayed: boolean;
}

export interface ReceiptResult extends ReceiptRow {
  replayed: boolean;
}

export interface MonthValue {
  month: string;
  value: number;
}

export interface DashboardData {
  range: { from: string; to: string };
  can_view_fees: boolean;
  cards: {
    total_students: number;
    active_students: number;
    total_enquiries: number;
    enrolled_students: number;
    active_courses: number;
    new_registrations_this_month: number;
    period_registrations: number;
    fees_collected: number | null;
    period_collected: number | null;
    outstanding: number | null;
    overdue: number | null;
  };
  monthly_registrations: MonthValue[];
  monthly_collections: MonthValue[] | null;
  course_distribution: { course: string; code: string; total: number; enrolled: number }[];
  fee_status: {
    collected: number;
    outstanding: number;
    by_status: Partial<Record<PaymentStatus, { count: number; balance: number }>>;
  } | null;
  conversion: { total: number; enrolled: number; rate: number; by_status: Partial<Record<AdmissionStatus, number>> };
}
