-- =====================================================================
-- 001 - Core schema: types, tables, constraints, indexes
-- Money is NUMERIC(12,2) everywhere; never float.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Internal objects that must never be reachable through the Data API.
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------
create type public.app_role as enum ('super_admin', 'administrator', 'accounts_staff', 'admissions_staff');
create type public.admission_status as enum (
  'new_enquiry', 'contacted', 'application_submitted', 'under_review',
  'approved', 'enrolled', 'rejected', 'withdrawn'
);
create type public.payment_method as enum ('upi', 'cash', 'bank_transfer', 'card', 'cheque', 'other');
create type public.payment_kind as enum ('payment', 'refund');
create type public.course_status as enum ('draft', 'published', 'inactive');
create type public.course_level as enum ('beginner', 'intermediate', 'advanced', 'all_levels');
create type public.duration_unit as enum ('hours', 'days', 'weeks', 'months', 'years');
create type public.gender as enum ('male', 'female', 'other', 'prefer_not_to_say');
create type public.batch_mode as enum ('classroom', 'online', 'hybrid');
create type public.note_type as enum ('note', 'call', 'email', 'whatsapp', 'meeting', 'status_change', 'system');

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Institute settings (singleton row, public profile information only)
-- ---------------------------------------------------------------------
create table public.institute_settings (
  id smallint primary key default 1 check (id = 1),
  institute_name text not null default 'Your Institute Name' check (char_length(institute_name) between 2 and 150),
  tagline text check (char_length(tagline) <= 200),
  about text check (char_length(about) <= 4000),
  logo_path text check (char_length(logo_path) <= 300),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 30),
  alt_phone text check (char_length(alt_phone) <= 30),
  whatsapp text check (char_length(whatsapp) <= 30),
  address_line text check (char_length(address_line) <= 300),
  city text check (char_length(city) <= 80),
  state text check (char_length(state) <= 80),
  postal_code text check (char_length(postal_code) <= 12),
  country text not null default 'India' check (char_length(country) <= 80),
  website text check (char_length(website) <= 200),
  office_hours text check (char_length(office_hours) <= 200),
  privacy_policy text check (char_length(privacy_policy) <= 20000),
  receipt_footer text check (char_length(receipt_footer) <= 500),
  authorised_signatory text check (char_length(authorised_signatory) <= 100),
  tax_id text check (char_length(tax_id) <= 30),
  currency char(3) not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.institute_settings (id) values (1);

-- ---------------------------------------------------------------------
-- Staff accounts & roles
-- ---------------------------------------------------------------------
create table public.admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (char_length(email) <= 200),
  full_name text not null check (char_length(full_name) between 2 and 100),
  phone text check (char_length(phone) <= 30),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index admin_users_email_key on public.admin_users (lower(email));

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin_users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- ---------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------
create table public.course_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  description text check (char_length(description) <= 500),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index course_categories_name_key on public.course_categories (lower(name));

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  title text not null check (char_length(title) between 3 and 150),
  category_id uuid references public.course_categories (id) on delete restrict,
  short_description text not null check (char_length(short_description) between 10 and 300),
  description text not null default '' check (char_length(description) <= 8000),
  eligibility text check (char_length(eligibility) <= 1000),
  level public.course_level not null default 'all_levels',
  duration_value int not null check (duration_value between 1 and 1000),
  duration_unit public.duration_unit not null default 'months',
  image_path text check (char_length(image_path) <= 300),
  highlights text[] not null default '{}' check (cardinality(highlights) <= 12),
  max_capacity int check (max_capacity is null or max_capacity > 0),
  is_featured boolean not null default false,
  status public.course_status not null default 'draft',
  sort_order int not null default 0,
  created_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_status_idx on public.courses (status);
create index courses_category_idx on public.courses (category_id);

-- Versioned fee definitions. Rows are immutable; a fee change inserts a new current row.
create table public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  tuition_fee numeric(12, 2) not null check (tuition_fee >= 0),
  admission_fee numeric(12, 2) not null default 0 check (admission_fee >= 0),
  registration_fee numeric(12, 2) not null default 0 check (registration_fee >= 0),
  total_fee numeric(12, 2) generated always as (tuition_fee + admission_fee + registration_fee) stored,
  installment_count int not null default 1 check (installment_count between 1 and 36),
  installment_interval_months int not null default 1 check (installment_interval_months between 1 and 12),
  is_current boolean not null default true,
  effective_from date not null default current_date,
  notes text check (char_length(notes) <= 500),
  created_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index fee_structures_one_current on public.fee_structures (course_id) where is_current;

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 100),
  start_date date not null,
  end_date date,
  schedule text check (char_length(schedule) <= 200),
  mode public.batch_mode not null default 'classroom',
  capacity int check (capacity is null or capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  unique (course_id, name)
);
create index batches_course_idx on public.batches (course_id);

-- ---------------------------------------------------------------------
-- Students & admissions
-- ---------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  student_code text not null unique,
  full_name text not null check (char_length(full_name) between 2 and 100),
  date_of_birth date,
  gender public.gender,
  email text not null check (char_length(email) <= 200 and email ~* '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'),
  mobile text not null check (mobile ~ '^\+[1-9][0-9]{7,14}$'),
  alt_mobile text check (alt_mobile ~ '^\+[1-9][0-9]{7,14}$'),
  address_line text check (char_length(address_line) <= 300),
  city text not null check (char_length(city) between 2 and 80),
  state text not null check (char_length(state) between 2 and 80),
  postal_code text not null check (postal_code ~ '^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$'),
  country text not null default 'India' check (char_length(country) <= 80),
  highest_qualification text not null check (char_length(highest_qualification) between 2 and 120),
  institution_name text check (char_length(institution_name) <= 150),
  privacy_consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index students_email_key on public.students (lower(email));
create index students_mobile_idx on public.students (mobile);
create index students_name_trgm_idx on public.students using gin (full_name extensions.gin_trgm_ops);

create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  registration_no text not null unique,
  student_id uuid not null references public.students (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  batch_id uuid references public.batches (id) on delete restrict,
  fee_structure_id uuid references public.fee_structures (id) on delete restrict,
  status public.admission_status not null default 'new_enquiry',
  status_changed_at timestamptz not null default now(),
  source text not null default 'website' check (source in ('website', 'walk_in', 'phone', 'referral', 'other')),
  student_message text check (char_length(student_message) <= 2000),
  -- Agreed fee snapshot: later course price changes never alter these.
  tuition_fee numeric(12, 2) not null default 0 check (tuition_fee >= 0),
  admission_fee numeric(12, 2) not null default 0 check (admission_fee >= 0),
  registration_fee numeric(12, 2) not null default 0 check (registration_fee >= 0),
  additional_charges numeric(12, 2) not null default 0 check (additional_charges >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  scholarship numeric(12, 2) not null default 0 check (scholarship >= 0),
  total_fee numeric(12, 2) generated always as (
    tuition_fee + admission_fee + registration_fee + additional_charges - discount - scholarship
  ) stored,
  fee_remarks text check (char_length(fee_remarks) <= 500),
  installment_count int not null default 1 check (installment_count between 0 and 36),
  client_token uuid unique,
  enrolled_at timestamptz,
  created_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollment_total_non_negative check (
    tuition_fee + admission_fee + registration_fee + additional_charges - discount - scholarship >= 0
  )
);
-- One open application per student per course; re-applying after rejection/withdrawal is allowed.
create unique index enrollments_one_open_per_course on public.student_enrollments (student_id, course_id)
  where status not in ('rejected', 'withdrawn');
create index enrollments_status_idx on public.student_enrollments (status);
create index enrollments_course_idx on public.student_enrollments (course_id);
create index enrollments_batch_idx on public.student_enrollments (batch_id);
create index enrollments_student_idx on public.student_enrollments (student_id);
create index enrollments_created_idx on public.student_enrollments (created_at desc);

create table public.fee_installments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.student_enrollments (id) on delete cascade,
  installment_no int not null check (installment_no between 1 and 36),
  due_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  label text check (char_length(label) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, installment_no)
);

create table public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.student_enrollments (id) on delete restrict,
  kind public.payment_kind not null default 'payment',
  amount numeric(12, 2) not null check (amount > 0 and amount <= 99999999.99),
  payment_date date not null,
  method public.payment_method not null,
  transaction_reference text check (char_length(transaction_reference) <= 100),
  remarks text check (char_length(remarks) <= 500),
  idempotency_key uuid not null unique,
  recorded_by uuid references public.admin_users (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.admin_users (id) on delete set null,
  void_reason text check (char_length(void_reason) <= 500),
  created_at timestamptz not null default now(),
  constraint void_fields_consistent check ((voided_at is null) = (void_reason is null))
);
create index fee_payments_enrollment_idx on public.fee_payments (enrollment_id);
create index fee_payments_date_idx on public.fee_payments (payment_date);
-- A UPI/bank/card/cheque reference can only be recorded once (prevents duplicate entry of the same transaction).
create unique index fee_payments_reference_key on public.fee_payments (method, lower(transaction_reference))
  where transaction_reference is not null and voided_at is null and kind = 'payment';

create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  payment_id uuid not null unique references public.fee_payments (id) on delete restrict,
  enrollment_id uuid not null references public.student_enrollments (id) on delete restrict,
  kind public.payment_kind not null,
  student_name text not null,
  student_code text not null,
  registration_no text not null,
  course_title text not null,
  batch_name text,
  amount numeric(12, 2) not null,
  payment_date date not null,
  method public.payment_method not null,
  transaction_reference text,
  total_fee numeric(12, 2) not null,
  previous_balance numeric(12, 2) not null,
  remaining_balance numeric(12, 2) not null,
  issued_by uuid references public.admin_users (id) on delete set null,
  issued_by_name text,
  issued_at timestamptz not null default now(),
  is_void boolean not null default false
);
create index payment_receipts_enrollment_idx on public.payment_receipts (enrollment_id);

create table public.admission_notes (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.student_enrollments (id) on delete cascade,
  note_type public.note_type not null default 'note',
  body text not null check (char_length(body) between 1 and 4000),
  created_by uuid default auth.uid() references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index admission_notes_enrollment_idx on public.admission_notes (enrollment_id, created_at desc);

-- ---------------------------------------------------------------------
-- Audit & integration outbox
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);

-- Messages queued for a future email/WhatsApp worker. Nothing is sent automatically today.
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  recipient text not null,
  template text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notification_outbox_pending_idx on public.notification_outbox (created_at) where status = 'pending';

-- ---------------------------------------------------------------------
-- Private support tables
-- ---------------------------------------------------------------------
create table private.document_counters (
  doc_type text not null,
  year int not null,
  last_value int not null default 0,
  primary key (doc_type, year)
);

create table private.registration_attempts (
  id bigint generated always as identity primary key,
  ip_hash text,
  email text,
  created_at timestamptz not null default now()
);
create index registration_attempts_ip_idx on private.registration_attempts (ip_hash, created_at);
create index registration_attempts_email_idx on private.registration_attempts (email, created_at);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'institute_settings', 'admin_users', 'course_categories', 'courses', 'fee_structures', 'batches',
    'students', 'student_enrollments', 'fee_installments'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t
    );
  end loop;
end $$;
