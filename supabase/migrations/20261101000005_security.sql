-- =====================================================================
-- 005 - Privileges, Row Level Security and Storage
-- Principle: deny by default, then grant the minimum.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Reset privileges (Supabase cloud grants ALL to anon/authenticated by default)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- service_role is used only server-side (edge function, admin scripts) and bypasses RLS.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- RLS policies and invoker views call these helpers, so roles need USAGE + EXECUTE (but no table access in private).
grant usage on schema private to anon, authenticated;
grant execute on function
  private.is_staff(), private.has_any_role(public.app_role[]), private.permission_roles(text),
  private.can(text), private.today(), private.seat_statuses()
to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Table privileges (RLS below narrows rows)
-- ---------------------------------------------------------------------
grant select on public.institute_settings, public.course_categories, public.courses, public.fee_structures, public.batches
  to anon;

grant select on
  public.institute_settings, public.admin_users, public.user_roles, public.course_categories, public.courses,
  public.fee_structures, public.batches, public.students, public.student_enrollments, public.fee_installments,
  public.fee_payments, public.payment_receipts, public.admission_notes, public.audit_logs, public.notification_outbox,
  public.enrollment_overview, public.payment_ledger
to authenticated;

grant update on public.institute_settings to authenticated;
grant update (full_name, phone) on public.admin_users to authenticated;
grant insert, delete on public.user_roles to authenticated;
grant insert, update, delete on public.course_categories to authenticated;
grant insert, update on public.courses to authenticated;
grant insert, update, delete on public.batches to authenticated;
grant update (full_name, date_of_birth, gender, email, mobile, alt_mobile, address_line, city, state, postal_code,
  country, highest_qualification, institution_name) on public.students to authenticated;
grant insert on public.admission_notes to authenticated;

-- ---------------------------------------------------------------------
-- 3. Function privileges
-- ---------------------------------------------------------------------
grant execute on function public.get_public_catalog() to anon, authenticated;
grant execute on function public.submit_registration(
  text, text, text, text, text, text, text, uuid, boolean, date, public.gender, text, text, uuid, text, uuid, text
) to anon, authenticated;

grant execute on function
  public.my_profile(),
  public.update_enrollment_status(uuid, public.admission_status, text),
  public.update_enrollment_batch(uuid, uuid),
  public.update_enrollment_fees(uuid, numeric, numeric, numeric, numeric, numeric, numeric, int, date, int, text),
  public.save_installment_plan(uuid, jsonb),
  public.set_course_fee(uuid, numeric, numeric, numeric, int, int, text),
  public.delete_course(uuid),
  public.record_payment(uuid, numeric, public.payment_method, date, uuid, text, text),
  public.record_refund(uuid, numeric, public.payment_method, date, uuid, text, text),
  public.void_payment(uuid, text),
  public.dashboard_summary(date, date),
  public.report_collections(date, date, text),
  public.report_payment_methods(date, date),
  public.report_course_revenue(date, date),
  public.report_outstanding(uuid, boolean)
to authenticated;

-- ---------------------------------------------------------------------
-- 4. Row Level Security - enabled on every table
-- ---------------------------------------------------------------------
alter table public.institute_settings enable row level security;
alter table public.admin_users enable row level security;
alter table public.user_roles enable row level security;
alter table public.course_categories enable row level security;
alter table public.courses enable row level security;
alter table public.fee_structures enable row level security;
alter table public.batches enable row level security;
alter table public.students enable row level security;
alter table public.student_enrollments enable row level security;
alter table public.fee_installments enable row level security;
alter table public.fee_payments enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.admission_notes enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notification_outbox enable row level security;
alter table private.document_counters enable row level security;
alter table private.registration_attempts enable row level security;

-- Institute profile: public read, Super Admin edit.
create policy settings_read on public.institute_settings for select to anon, authenticated using (true);
create policy settings_update on public.institute_settings for update to authenticated
  using ((select private.can('settings.manage'))) with check ((select private.can('settings.manage')));

-- Staff directory: visible to staff (names on notes/receipts). Accounts are created by the admin-users edge function.
create policy admin_users_read on public.admin_users for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));
create policy admin_users_update on public.admin_users for update to authenticated
  using ((select private.can('users.manage')) or id = (select auth.uid()))
  with check ((select private.can('users.manage')) or id = (select auth.uid()));

-- Roles: only Super Admins manage roles, and never their own (no self-elevation or self-lockout).
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.can('users.manage')));
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check ((select private.can('users.manage')) and user_id <> (select auth.uid()) and granted_by = (select auth.uid()));
create policy user_roles_delete on public.user_roles for delete to authenticated
  using ((select private.can('users.manage')) and user_id <> (select auth.uid()));

-- Catalogue: public sees active/published rows only; course managers see and edit everything.
create policy categories_read on public.course_categories for select to anon, authenticated
  using (is_active or (select private.is_staff()));
create policy categories_write on public.course_categories for all to authenticated
  using ((select private.can('courses.manage'))) with check ((select private.can('courses.manage')));

create policy courses_read on public.courses for select to anon, authenticated
  using (status = 'published' or (select private.is_staff()));
create policy courses_insert on public.courses for insert to authenticated
  with check ((select private.can('courses.manage')));
create policy courses_update on public.courses for update to authenticated
  using ((select private.can('courses.manage'))) with check ((select private.can('courses.manage')));

create policy fee_structures_read on public.fee_structures for select to anon, authenticated
  using (
    (is_current and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published'))
    or (select private.is_staff())
  );

create policy batches_read on public.batches for select to anon, authenticated
  using (
    (is_active and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published'))
    or (select private.is_staff())
  );
create policy batches_write on public.batches for all to authenticated
  using ((select private.can('courses.manage'))) with check ((select private.can('courses.manage')));

-- Student data: staff only. Inserts happen through submit_registration().
create policy students_read on public.students for select to authenticated
  using ((select private.can('students.read')));
create policy students_update on public.students for update to authenticated
  using ((select private.can('students.write'))) with check ((select private.can('students.write')));

create policy enrollments_read on public.student_enrollments for select to authenticated
  using ((select private.can('students.read')));

create policy notes_read on public.admission_notes for select to authenticated
  using ((select private.can('students.read')));
create policy notes_insert on public.admission_notes for insert to authenticated
  with check (
    (select private.can('notes.write'))
    and created_by = (select auth.uid())
    and note_type not in ('system', 'status_change')
  );

-- Financial data: roles with fees.read only. All writes go through RPCs.
create policy installments_read on public.fee_installments for select to authenticated
  using ((select private.can('fees.read')));
create policy payments_read on public.fee_payments for select to authenticated
  using ((select private.can('fees.read')));
create policy receipts_read on public.payment_receipts for select to authenticated
  using ((select private.can('fees.read')));

create policy audit_read on public.audit_logs for select to authenticated
  using ((select private.can('audit.read')));
create policy outbox_read on public.notification_outbox for select to authenticated
  using ((select private.can('users.manage')));

-- ---------------------------------------------------------------------
-- 5. Storage: public image bucket for course images and the institute logo
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-assets', 'public-assets', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy public_assets_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'public-assets' and (
      ((storage.foldername(name))[1] = 'courses' and (select private.can('courses.manage')))
      or ((storage.foldername(name))[1] = 'branding' and (select private.can('settings.manage')))
    )
  );
create policy public_assets_update on storage.objects for update to authenticated
  using (
    bucket_id = 'public-assets' and (
      ((storage.foldername(name))[1] = 'courses' and (select private.can('courses.manage')))
      or ((storage.foldername(name))[1] = 'branding' and (select private.can('settings.manage')))
    )
  );
create policy public_assets_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'public-assets' and (
      ((storage.foldername(name))[1] = 'courses' and (select private.can('courses.manage')))
      or ((storage.foldername(name))[1] = 'branding' and (select private.can('settings.manage')))
    )
  );
