-- =====================================================================
-- 002 - Role based access control & internal helpers
-- All helpers live in the non-exposed `private` schema.
-- =====================================================================

-- True when the caller is an active staff member.
create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_users au where au.id = auth.uid() and au.is_active
  );
$$;

create or replace function private.has_any_role(p_roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.admin_users au on au.id = ur.user_id
    where ur.user_id = auth.uid() and au.is_active and ur.role = any (p_roles)
  );
$$;

-- Single source of truth for the permission matrix (documented in SECURITY_REVIEW.md).
create or replace function private.permission_roles(p_permission text)
returns public.app_role[] language sql immutable set search_path = '' as $$
  select case p_permission
    when 'courses.manage'    then array['super_admin', 'administrator']
    when 'students.read'     then array['super_admin', 'administrator', 'accounts_staff', 'admissions_staff']
    when 'students.write'    then array['super_admin', 'administrator', 'admissions_staff']
    when 'admissions.manage' then array['super_admin', 'administrator', 'admissions_staff']
    when 'notes.write'       then array['super_admin', 'administrator', 'accounts_staff', 'admissions_staff']
    when 'fees.read'         then array['super_admin', 'administrator', 'accounts_staff']
    when 'fees.configure'    then array['super_admin', 'administrator']
    when 'payments.record'   then array['super_admin', 'accounts_staff']
    when 'payments.adjust'   then array['super_admin']
    when 'reports.view'      then array['super_admin', 'administrator', 'accounts_staff']
    when 'users.manage'      then array['super_admin']
    when 'settings.manage'   then array['super_admin']
    when 'audit.read'        then array['super_admin']
    else array[]::text[]
  end::public.app_role[];
$$;

create or replace function private.can(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role(private.permission_roles(p_permission));
$$;

-- Raises a client-facing error. `p_field` is returned in the `hint` so the UI can highlight the field.
-- PTxxx codes make PostgREST respond with HTTP status xxx.
create or replace function private.fail(p_message text, p_field text default null, p_code text default 'PT400')
returns void language plpgsql set search_path = '' as $$
begin
  raise exception using message = p_message, hint = coalesce(p_field, ''), errcode = p_code;
end $$;

create or replace function private.require(p_permission text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can(p_permission) then
    raise exception using message = 'You do not have permission to perform this action', errcode = '42501';
  end if;
end $$;

-- "Today" in the institute's time zone.
create or replace function private.today()
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select timezone from public.institute_settings where id = 1), 'Asia/Kolkata'))::date;
$$;

-- Gap-free per-year document numbers, e.g. REG-2026-00001. Row lock serialises concurrent callers.
create or replace function private.next_document_no(p_doc_type text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_year int := extract(year from private.today())::int;
  v_value int;
begin
  insert into private.document_counters as dc (doc_type, year, last_value)
  values (p_doc_type, v_year, 1)
  on conflict (doc_type, year) do update set last_value = dc.last_value + 1
  returning last_value into v_value;
  return format('%s-%s-%s', p_doc_type, v_year, lpad(v_value::text, 5, '0'));
end $$;

-- Strips control characters and angle brackets, collapses runs of spaces, trims. Returns NULL for blank input.
create or replace function private.clean_text(p_value text)
returns text language sql immutable set search_path = '' as $$
  select nullif(
    btrim(regexp_replace(
      regexp_replace(coalesce(p_value, ''), E'[\\u0001-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F<>]', '', 'g'),
      '[ \t]+', ' ', 'g'
    )),
    ''
  );
$$;

-- Normalises Indian (10-digit, optional +91/0 prefix) and international E.164 numbers to +<digits>.
-- Returns NULL when the number is invalid.
create or replace function private.normalize_mobile(p_value text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(p_value, ''), '[\s().-]', '', 'g');
begin
  if d ~ '^[6-9][0-9]{9}$' then
    return '+91' || d;
  elsif d ~ '^(\+91|0091|91|0)[6-9][0-9]{9}$' then
    return '+91' || right(d, 10);
  elsif d ~ '^(\+|00)91' then
    return null; -- +91 prefix but not a valid Indian mobile
  elsif d ~ '^(\+|00)[1-9][0-9]{7,14}$' then
    return '+' || regexp_replace(d, '^(\+|00)', '');
  end if;
  return null;
end $$;

create or replace function private.normalize_email(p_value text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  e text := lower(btrim(coalesce(p_value, '')));
begin
  if char_length(e) between 6 and 200 and e ~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$' then
    return e;
  end if;
  return null;
end $$;

-- Splits a total into N monthly installments; the last one absorbs rounding so the sum is exact.
create or replace function private.generate_installments(
  p_enrollment_id uuid, p_count int, p_first_due date, p_interval_months int
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_total numeric(12, 2);
  v_each numeric(12, 2);
  i int;
begin
  select total_fee into v_total from public.student_enrollments where id = p_enrollment_id;
  delete from public.fee_installments where enrollment_id = p_enrollment_id;

  if v_total = 0 then
    update public.student_enrollments set installment_count = 0 where id = p_enrollment_id;
    return;
  end if;
  if p_count is null or p_count < 1 or p_count > 36 then
    perform private.fail('Installment count must be between 1 and 36', 'installment_count');
  end if;
  if p_first_due is null or p_interval_months is null or p_interval_months not between 1 and 12 then
    perform private.fail('Invalid installment schedule', 'first_due_date');
  end if;
  if v_total < p_count * 0.01 then
    p_count := 1;
  end if;

  v_each := trunc(v_total / p_count, 2);
  for i in 1 .. p_count loop
    insert into public.fee_installments (enrollment_id, installment_no, due_date, amount)
    values (
      p_enrollment_id, i,
      (p_first_due + make_interval(months => (i - 1) * p_interval_months))::date,
      case when i = p_count then v_total - v_each * (p_count - 1) else v_each end
    );
  end loop;
  update public.student_enrollments set installment_count = p_count where id = p_enrollment_id;
end $$;

-- Fee position of one enrollment, computed only from database records.
create or replace function private.enrollment_balance(p_enrollment_id uuid)
returns table (total_fee numeric, amount_paid numeric, amount_refunded numeric, net_paid numeric, balance numeric)
language sql stable security definer set search_path = '' as $$
  select
    e.total_fee,
    coalesce(sum(p.amount) filter (where p.kind = 'payment'), 0),
    coalesce(sum(p.amount) filter (where p.kind = 'refund'), 0),
    coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0),
    e.total_fee - coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0)
  from public.student_enrollments e
  left join public.fee_payments p on p.enrollment_id = e.id and p.voided_at is null
  where e.id = p_enrollment_id
  group by e.id, e.total_fee;
$$;

-- Statuses that occupy a seat and are billable.
create or replace function private.seat_statuses()
returns public.admission_status[] language sql immutable set search_path = '' as $$
  select array['approved', 'enrolled']::public.admission_status[];
$$;

create or replace function private.ensure_capacity(p_course_id uuid, p_batch_id uuid, p_exclude_enrollment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_capacity int;
  v_used int;
begin
  select max_capacity into v_capacity from public.courses where id = p_course_id;
  if v_capacity is not null then
    select count(*) into v_used from public.student_enrollments
    where course_id = p_course_id and status = any (private.seat_statuses())
      and id is distinct from p_exclude_enrollment;
    if v_used >= v_capacity then
      perform private.fail('This course has reached its maximum capacity', 'course_id', 'PT409');
    end if;
  end if;
  if p_batch_id is not null then
    select capacity into v_capacity from public.batches where id = p_batch_id;
    if v_capacity is not null then
      select count(*) into v_used from public.student_enrollments
      where batch_id = p_batch_id and status = any (private.seat_statuses())
        and id is distinct from p_exclude_enrollment;
      if v_used >= v_capacity then
        perform private.fail('The selected batch is full', 'batch_id', 'PT409');
      end if;
    end if;
  end if;
end $$;

create or replace function private.add_note(p_enrollment_id uuid, p_type public.note_type, p_body text)
returns void language sql security definer set search_path = '' as $$
  insert into public.admission_notes (enrollment_id, note_type, body, created_by)
  values (p_enrollment_id, p_type, p_body, (select id from public.admin_users where id = auth.uid()));
$$;

create or replace function private.fmt_money(p numeric)
returns text language sql immutable set search_path = '' as $$
  select to_char(p, 'FM99,99,99,99,990.00');
$$;

-- ---------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------

-- Financial records are append-only: only the void fields may change, once.
create or replace function private.protect_fee_payments()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payment records cannot be deleted; void them instead' using errcode = '42501';
  end if;
  if old.voided_at is not null then
    raise exception 'A voided payment cannot be changed' using errcode = '42501';
  end if;
  if (new.enrollment_id, new.kind, new.amount, new.payment_date, new.method, new.transaction_reference,
      new.remarks, new.idempotency_key, new.recorded_by, new.created_at)
     is distinct from
     (old.enrollment_id, old.kind, old.amount, old.payment_date, old.method, old.transaction_reference,
      old.remarks, old.idempotency_key, old.recorded_by, old.created_at) then
    raise exception 'Payment details cannot be edited; void and re-record instead' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger protect_fee_payments before update or delete on public.fee_payments
  for each row execute function private.protect_fee_payments();

create or replace function private.protect_receipts()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Receipts cannot be deleted' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'is_void') is distinct from (to_jsonb(old) - 'is_void') then
    raise exception 'Receipts cannot be edited' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger protect_receipts before update or delete on public.payment_receipts
  for each row execute function private.protect_receipts();

-- Fee structures are versioned; only the is_current flag may change.
create or replace function private.protect_fee_structures()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.student_enrollments where fee_structure_id = old.id) then
      raise exception 'Fee structure is referenced by enrollments' using errcode = '23503';
    end if;
    return old;
  end if;
  -- Generated columns (total_fee) are NULL in BEFORE triggers, so they are excluded from the comparison.
  if (to_jsonb(new) - 'is_current' - 'updated_at' - 'total_fee') is distinct from (to_jsonb(old) - 'is_current' - 'updated_at' - 'total_fee') then
    raise exception 'Fee structures are immutable; create a new version instead' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger protect_fee_structures before update or delete on public.fee_structures
  for each row execute function private.protect_fee_structures();

-- A course can only be published when it has a current fee structure.
create or replace function private.check_course_publishable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' and not exists (
    select 1 from public.fee_structures where course_id = new.id and is_current
  ) then
    raise exception using message = 'Set the course fee before publishing the course', hint = 'status', errcode = 'PT400';
  end if;
  return new;
end $$;
create trigger check_course_publishable before insert or update of status on public.courses
  for each row execute function private.check_course_publishable();

-- There must always be at least one active Super Admin.
create or replace function private.protect_last_super_admin()
returns trigger language plpgsql set search_path = '' as $$
declare v_user uuid;
begin
  if tg_table_name = 'user_roles' then
    if old.role <> 'super_admin' then return old; end if;
    v_user := old.user_id;
  else
    if not (old.is_active and not new.is_active) then return new; end if;
    v_user := old.id;
    if not exists (select 1 from public.user_roles where user_id = v_user and role = 'super_admin') then
      return new;
    end if;
  end if;
  if not exists (
    select 1 from public.user_roles ur join public.admin_users au on au.id = ur.user_id
    where ur.role = 'super_admin' and au.is_active and ur.user_id <> v_user
  ) then
    raise exception 'At least one active Super Admin must remain' using errcode = 'PT409';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger protect_last_super_admin before delete on public.user_roles
  for each row execute function private.protect_last_super_admin();
create trigger protect_last_super_admin before update of is_active on public.admin_users
  for each row execute function private.protect_last_super_admin();

-- ---------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------
create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_id text;
begin
  v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id');
  insert into public.audit_logs (actor_id, actor_email, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    tg_op,
    tg_table_name,
    v_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'institute_settings', 'admin_users', 'user_roles', 'course_categories', 'courses', 'fee_structures',
    'batches', 'students', 'student_enrollments', 'fee_installments', 'fee_payments', 'payment_receipts'
  ] loop
    execute format(
      'create trigger audit_row after insert or update or delete on public.%I for each row execute function private.audit_row()', t
    );
  end loop;
end $$;
