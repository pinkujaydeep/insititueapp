-- =====================================================================
-- 003 - Views and business RPCs (all writes to admissions/finance go through here)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enrollment overview with fee position (RLS of the caller applies)
-- Fee columns are NULL for staff without the fees.read permission.
-- ---------------------------------------------------------------------
create or replace view public.enrollment_overview with (security_invoker = true) as
select
  e.id,
  e.registration_no,
  e.status,
  e.status_changed_at,
  e.source,
  e.student_message,
  e.created_at,
  e.enrolled_at,
  e.student_id,
  s.student_code,
  s.full_name,
  s.email,
  s.mobile,
  s.city,
  e.course_id,
  c.code as course_code,
  c.title as course_title,
  e.batch_id,
  b.name as batch_name,
  b.start_date as batch_start_date,
  b.end_date as batch_end_date,
  case when perm.fees then e.total_fee end as total_fee,
  case when perm.fees then f.net_paid end as net_paid,
  case when perm.fees then f.amount_refunded end as amount_refunded,
  case when perm.fees then e.total_fee - f.net_paid end as balance,
  case when perm.fees then nx.installment_no end as next_installment_no,
  case when perm.fees then nx.due_date end as next_due_date,
  case when perm.fees then nx.due_amount end as next_due_amount,
  case when perm.fees then
    case when e.status = any (array['approved', 'enrolled']::public.admission_status[])
      then greatest(0, coalesce(od.due_till_today, 0) - f.net_paid) else 0 end
  end as overdue_amount,
  case when perm.fees then
    case
      when f.amount_refunded > 0 and f.net_paid <= 0 then 'refunded'
      when e.total_fee - f.net_paid <= 0 then 'paid'
      when e.status = any (array['approved', 'enrolled']::public.admission_status[])
        and coalesce(od.due_till_today, 0) - f.net_paid > 0 then 'overdue'
      when f.net_paid > 0 then 'partially_paid'
      else 'pending'
    end
  end as payment_status
from public.student_enrollments e
join public.students s on s.id = e.student_id
join public.courses c on c.id = e.course_id
left join public.batches b on b.id = e.batch_id
cross join lateral (select private.can('fees.read') as fees) perm
cross join lateral (
  select
    coalesce(sum(p.amount) filter (where p.kind = 'refund'), 0) as amount_refunded,
    coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0) as net_paid
  from public.fee_payments p
  where p.enrollment_id = e.id and p.voided_at is null
) f
left join lateral (
  select x.installment_no, x.due_date, least(x.amount, x.cumulative - f.net_paid) as due_amount
  from (
    select i.installment_no, i.due_date, i.amount,
           sum(i.amount) over (order by i.installment_no) as cumulative
    from public.fee_installments i
    where i.enrollment_id = e.id
  ) x
  where x.cumulative > f.net_paid
  order by x.installment_no
  limit 1
) nx on true
left join lateral (
  select sum(i.amount) as due_till_today
  from public.fee_installments i
  where i.enrollment_id = e.id and i.due_date < private.today()
) od on true;

create or replace view public.payment_ledger with (security_invoker = true) as
select
  p.id,
  p.enrollment_id,
  p.kind,
  p.amount,
  p.payment_date,
  p.method,
  p.transaction_reference,
  p.remarks,
  p.voided_at,
  p.void_reason,
  p.created_at,
  r.id as receipt_id,
  r.receipt_no,
  e.registration_no,
  e.course_id,
  c.code as course_code,
  c.title as course_title,
  s.id as student_id,
  s.student_code,
  s.full_name as student_name,
  au.full_name as recorded_by_name
from public.fee_payments p
join public.student_enrollments e on e.id = p.enrollment_id
join public.students s on s.id = e.student_id
join public.courses c on c.id = e.course_id
left join public.payment_receipts r on r.payment_id = p.id
left join public.admin_users au on au.id = p.recorded_by;

-- ---------------------------------------------------------------------
-- Session profile for the admin UI
-- ---------------------------------------------------------------------
create or replace function public.my_profile()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when au.id is null then null else jsonb_build_object(
    'id', au.id,
    'email', au.email,
    'full_name', au.full_name,
    'is_active', au.is_active,
    'roles', coalesce((select jsonb_agg(ur.role order by ur.role) from public.user_roles ur where ur.user_id = au.id), '[]'),
    'permissions', coalesce((
      select jsonb_agg(p order by p) from unnest(array[
        'courses.manage', 'students.read', 'students.write', 'admissions.manage', 'notes.write', 'fees.read',
        'fees.configure', 'payments.record', 'payments.adjust', 'reports.view', 'users.manage',
        'settings.manage', 'audit.read'
      ]) p where au.is_active and private.can(p)
    ), '[]')
  ) end
  from (select 1) one
  left join public.admin_users au on au.id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Public catalogue (anonymous). Exposes only published, public-safe data.
-- ---------------------------------------------------------------------
create or replace function public.get_public_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', cc.id, 'name', cc.name, 'slug', cc.slug) order by cc.sort_order, cc.name)
      from public.course_categories cc
      where cc.is_active and exists (select 1 from public.courses c where c.category_id = cc.id and c.status = 'published')
    ), '[]'),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'code', c.code,
        'title', c.title,
        'category_id', c.category_id,
        'category_name', cc.name,
        'short_description', c.short_description,
        'description', c.description,
        'eligibility', c.eligibility,
        'level', c.level,
        'duration_value', c.duration_value,
        'duration_unit', c.duration_unit,
        'image_path', c.image_path,
        'highlights', c.highlights,
        'is_featured', c.is_featured,
        'tuition_fee', fs.tuition_fee,
        'admission_fee', fs.admission_fee,
        'registration_fee', fs.registration_fee,
        'total_fee', fs.total_fee,
        'installment_count', fs.installment_count,
        'seats_left', case when c.max_capacity is null then null else greatest(0, c.max_capacity - (
          select count(*) from public.student_enrollments e
          where e.course_id = c.id and e.status = any (private.seat_statuses())
        )) end,
        'batches', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', b.id, 'name', b.name, 'start_date', b.start_date, 'end_date', b.end_date,
            'schedule', b.schedule, 'mode', b.mode,
            'seats_left', case when b.capacity is null then null else greatest(0, b.capacity - (
              select count(*) from public.student_enrollments e
              where e.batch_id = b.id and e.status = any (private.seat_statuses())
            )) end
          ) order by b.start_date)
          from public.batches b
          where b.course_id = c.id and b.is_active and (b.end_date is null or b.end_date >= private.today())
        ), '[]')
      ) order by c.is_featured desc, c.sort_order, c.title)
      from public.courses c
      join public.fee_structures fs on fs.course_id = c.id and fs.is_current
      left join public.course_categories cc on cc.id = c.category_id
      where c.status = 'published'
    ), '[]')
  );
$$;

-- ---------------------------------------------------------------------
-- Public registration (anonymous)
-- ---------------------------------------------------------------------
create or replace function public.submit_registration(
  p_full_name text,
  p_email text,
  p_mobile text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_highest_qualification text,
  p_course_id uuid,
  p_privacy_consent boolean,
  p_date_of_birth date default null,
  p_gender public.gender default null,
  p_alt_mobile text default null,
  p_institution_name text default null,
  p_batch_id uuid default null,
  p_message text default null,
  p_client_token uuid default null,
  p_website text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text := private.clean_text(p_full_name);
  v_email text := private.normalize_email(p_email);
  v_mobile text := private.normalize_mobile(p_mobile);
  v_alt text;
  v_city text := private.clean_text(p_city);
  v_state text := private.clean_text(p_state);
  v_postal text := upper(private.clean_text(p_postal_code));
  v_qual text := private.clean_text(p_highest_qualification);
  v_inst text := private.clean_text(p_institution_name);
  v_msg text := private.clean_text(p_message);
  v_today date := private.today();
  v_ip text;
  v_ip_hash text;
  v_course public.courses;
  v_batch public.batches;
  v_fee public.fee_structures;
  v_student_id uuid;
  v_student_code text;
  v_enrollment public.student_enrollments;
  v_has_batches boolean;
  v_first_due date;
begin
  -- Bots fill the hidden honeypot field.
  if coalesce(p_website, '') <> '' then
    perform private.fail('Your submission could not be accepted');
  end if;

  -- A retried submission with the same client token returns the original result (double-click / network retry).
  if p_client_token is not null then
    select e.* into v_enrollment from public.student_enrollments e where e.client_token = p_client_token;
    if found then
      return (
        select jsonb_build_object(
          'registration_no', v_enrollment.registration_no, 'student_code', s.student_code,
          'full_name', s.full_name, 'course_title', c.title, 'batch_name', b.name,
          'total_fee', v_enrollment.total_fee, 'submitted_at', v_enrollment.created_at, 'replayed', true)
        from public.students s
        join public.courses c on c.id = v_enrollment.course_id
        left join public.batches b on b.id = v_enrollment.batch_id
        where s.id = v_enrollment.student_id
      );
    end if;
  end if;

  -- Field validation (server-side; the UI validates too but is never trusted).
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 100 or v_name ~ '[0-9@#$%^*_=+{}\[\]|\\/~`]' then
    perform private.fail('Enter your full name (2-100 letters)', 'full_name');
  end if;
  if v_email is null then
    perform private.fail('Enter a valid email address', 'email');
  end if;
  if v_mobile is null then
    perform private.fail('Enter a valid mobile number (10-digit Indian or +country code)', 'mobile');
  end if;
  if nullif(btrim(coalesce(p_alt_mobile, '')), '') is not null then
    v_alt := private.normalize_mobile(p_alt_mobile);
    if v_alt is null then
      perform private.fail('Enter a valid alternate mobile number', 'alt_mobile');
    end if;
    if v_alt = v_mobile then
      perform private.fail('Alternate mobile must be different from the mobile number', 'alt_mobile');
    end if;
  end if;
  if p_date_of_birth is not null and (p_date_of_birth > v_today - interval '10 years' or p_date_of_birth < v_today - interval '100 years') then
    perform private.fail('Enter a valid date of birth', 'date_of_birth');
  end if;
  if v_city is null or char_length(v_city) not between 2 and 80 then
    perform private.fail('Enter your city', 'city');
  end if;
  if v_state is null or char_length(v_state) not between 2 and 80 then
    perform private.fail('Enter your state', 'state');
  end if;
  if v_postal is null or v_postal !~ '^[A-Z0-9][A-Z0-9 -]{2,9}$' then
    perform private.fail('Enter a valid postal code', 'postal_code');
  end if;
  if v_mobile like '+91%' and v_postal !~ '^[1-9][0-9]{5}$' then
    perform private.fail('Enter a valid 6-digit PIN code', 'postal_code');
  end if;
  if v_qual is null or char_length(v_qual) not between 2 and 120 then
    perform private.fail('Enter your highest qualification', 'highest_qualification');
  end if;
  if v_inst is not null and char_length(v_inst) > 150 then
    perform private.fail('Institution name is too long', 'institution_name');
  end if;
  if v_msg is not null and char_length(v_msg) > 2000 then
    perform private.fail('Message must be under 2000 characters', 'message');
  end if;
  if p_privacy_consent is not true then
    perform private.fail('Please accept the privacy policy to continue', 'privacy_consent');
  end if;

  -- Abuse protection: limit successful submissions per IP and per email.
  v_ip := btrim(split_part(coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'cf-connecting-ip',
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for',
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-real-ip', ''), ',', 1));
  if v_ip <> '' then
    v_ip_hash := encode(extensions.digest(v_ip, 'sha256'), 'hex');
    if (select count(*) from private.registration_attempts
        where ip_hash = v_ip_hash and created_at > now() - interval '10 minutes') >= 5 then
      perform private.fail('Too many registrations from your network. Please try again later.', null, 'PT429');
    end if;
  end if;
  if (select count(*) from private.registration_attempts
      where email = v_email and created_at > now() - interval '1 hour') >= 3 then
    perform private.fail('Too many registrations for this email. Please try again later.', 'email', 'PT429');
  end if;

  -- Course, batch and fee checks. Locking the course row serialises capacity checks.
  select * into v_course from public.courses where id = p_course_id and status = 'published' for update;
  if not found then
    perform private.fail('The selected course is not open for registration', 'course_id', 'PT404');
  end if;
  select * into v_fee from public.fee_structures where course_id = v_course.id and is_current;
  if not found then
    perform private.fail('Fees for this course are not configured yet', 'course_id');
  end if;

  select exists (
    select 1 from public.batches
    where course_id = v_course.id and is_active and (end_date is null or end_date >= v_today)
  ) into v_has_batches;
  if p_batch_id is not null then
    select * into v_batch from public.batches
    where id = p_batch_id and course_id = v_course.id and is_active and (end_date is null or end_date >= v_today);
    if not found then
      perform private.fail('The selected batch is not available', 'batch_id');
    end if;
  elsif v_has_batches then
    perform private.fail('Please select a batch', 'batch_id');
  end if;
  perform private.ensure_capacity(v_course.id, v_batch.id, null);

  -- Existing students are matched by email; their stored details are never overwritten from the public form.
  select id, student_code into v_student_id, v_student_code from public.students where lower(email) = v_email;
  if v_student_id is null then
    v_student_code := private.next_document_no('STU');
    insert into public.students (
      student_code, full_name, date_of_birth, gender, email, mobile, alt_mobile,
      city, state, postal_code, highest_qualification, institution_name, privacy_consent_at
    ) values (
      v_student_code, v_name, p_date_of_birth, p_gender, v_email, v_mobile, v_alt,
      v_city, v_state, v_postal, v_qual, v_inst, now()
    ) returning id into v_student_id;
  end if;

  if exists (
    select 1 from public.student_enrollments
    where student_id = v_student_id and course_id = v_course.id and status not in ('rejected', 'withdrawn')
  ) then
    perform private.fail(
      'An application for this course already exists for this email address. Please contact the institute.',
      'course_id', 'PT409');
  end if;

  insert into public.student_enrollments (
    registration_no, student_id, course_id, batch_id, fee_structure_id, student_message,
    tuition_fee, admission_fee, registration_fee, installment_count, client_token
  ) values (
    private.next_document_no('REG'), v_student_id, v_course.id, v_batch.id, v_fee.id, v_msg,
    v_fee.tuition_fee, v_fee.admission_fee, v_fee.registration_fee, v_fee.installment_count, p_client_token
  ) returning * into v_enrollment;

  v_first_due := greatest(v_today, coalesce(v_batch.start_date, v_today));
  perform private.generate_installments(v_enrollment.id, v_fee.installment_count, v_first_due, v_fee.installment_interval_months);
  perform private.add_note(v_enrollment.id, 'system', 'Application received via website');

  insert into public.notification_outbox (channel, recipient, template, payload)
  values ('email', v_email, 'registration_received', jsonb_build_object(
    'registration_no', v_enrollment.registration_no, 'full_name', v_name, 'course_title', v_course.title));

  insert into private.registration_attempts (ip_hash, email) values (v_ip_hash, v_email);
  delete from private.registration_attempts where created_at < now() - interval '1 day';

  return jsonb_build_object(
    'registration_no', v_enrollment.registration_no,
    'student_code', v_student_code,
    'full_name', v_name,
    'course_title', v_course.title,
    'batch_name', v_batch.name,
    'total_fee', v_enrollment.total_fee,
    'submitted_at', v_enrollment.created_at,
    'replayed', false
  );
end $$;

-- ---------------------------------------------------------------------
-- Admissions (admissions.manage)
-- ---------------------------------------------------------------------
create or replace function public.update_enrollment_status(
  p_enrollment_id uuid, p_status public.admission_status, p_note text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_e public.student_enrollments;
  v_note text := private.clean_text(p_note);
begin
  perform private.require('admissions.manage');
  select * into v_e from public.student_enrollments where id = p_enrollment_id for update;
  if not found then perform private.fail('Registration not found', null, 'PT404'); end if;
  if v_e.status = p_status then return; end if;
  if v_note is not null and char_length(v_note) > 2000 then
    perform private.fail('Note is too long', 'note');
  end if;
  if p_status = any (private.seat_statuses()) and not v_e.status = any (private.seat_statuses()) then
    perform private.ensure_capacity(v_e.course_id, v_e.batch_id, v_e.id);
  end if;

  update public.student_enrollments
  set status = p_status,
      status_changed_at = now(),
      enrolled_at = case when p_status = 'enrolled' then coalesce(enrolled_at, now()) else enrolled_at end
  where id = v_e.id;

  perform private.add_note(v_e.id, 'status_change',
    format('Status changed from %s to %s', replace(v_e.status::text, '_', ' '), replace(p_status::text, '_', ' '))
    || coalesce(E'\n' || v_note, ''));
end $$;

create or replace function public.update_enrollment_batch(p_enrollment_id uuid, p_batch_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_e public.student_enrollments;
  v_name text;
begin
  perform private.require('admissions.manage');
  select * into v_e from public.student_enrollments where id = p_enrollment_id for update;
  if not found then perform private.fail('Registration not found', null, 'PT404'); end if;
  if p_batch_id is not null then
    select name into v_name from public.batches where id = p_batch_id and course_id = v_e.course_id and is_active;
    if v_name is null then perform private.fail('Batch does not belong to this course or is inactive', 'batch_id'); end if;
    if v_e.status = any (private.seat_statuses()) then
      perform private.ensure_capacity(v_e.course_id, p_batch_id, v_e.id);
    end if;
  end if;
  update public.student_enrollments set batch_id = p_batch_id where id = v_e.id;
  perform private.add_note(v_e.id, 'system', 'Batch changed to ' || coalesce(v_name, 'none'));
end $$;

-- ---------------------------------------------------------------------
-- Fee configuration (fees.configure) - the authorised adjustment workflow
-- ---------------------------------------------------------------------
create or replace function public.update_enrollment_fees(
  p_enrollment_id uuid,
  p_tuition_fee numeric,
  p_admission_fee numeric,
  p_registration_fee numeric,
  p_additional_charges numeric,
  p_discount numeric,
  p_scholarship numeric,
  p_installment_count int,
  p_first_due_date date,
  p_interval_months int default 1,
  p_remarks text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_e public.student_enrollments;
  v_total numeric;
  v_bal record;
  v_remarks text := private.clean_text(p_remarks);
begin
  perform private.require('fees.configure');
  select * into v_e from public.student_enrollments where id = p_enrollment_id for update;
  if not found then perform private.fail('Registration not found', null, 'PT404'); end if;

  if p_tuition_fee is null or p_tuition_fee < 0 or p_admission_fee < 0 or p_registration_fee < 0
     or p_additional_charges < 0 or p_discount < 0 or p_scholarship < 0 then
    perform private.fail('Fee amounts cannot be negative', 'tuition_fee');
  end if;
  if greatest(p_tuition_fee, p_admission_fee, p_registration_fee, p_additional_charges, p_discount, p_scholarship) > 99999999.99
     or scale(p_tuition_fee) > 2 or scale(p_admission_fee) > 2 or scale(p_registration_fee) > 2
     or scale(p_additional_charges) > 2 or scale(p_discount) > 2 or scale(p_scholarship) > 2 then
    perform private.fail('Amounts must have at most 2 decimal places', 'tuition_fee');
  end if;
  v_total := p_tuition_fee + p_admission_fee + p_registration_fee + p_additional_charges - p_discount - p_scholarship;
  if v_total < 0 then
    perform private.fail('Discount and scholarship cannot exceed the total fee', 'discount');
  end if;
  select * into v_bal from private.enrollment_balance(v_e.id);
  if v_total < v_bal.net_paid then
    perform private.fail(format('Total fee cannot be less than the amount already paid (%s). Record a refund first.',
      private.fmt_money(v_bal.net_paid)), 'tuition_fee');
  end if;
  if p_first_due_date is null then
    perform private.fail('Select the first installment due date', 'first_due_date');
  end if;
  if p_interval_months is null or p_interval_months not between 1 and 12 then
    perform private.fail('Installment interval must be 1-12 months', 'interval_months');
  end if;
  if v_remarks is not null and char_length(v_remarks) > 500 then
    perform private.fail('Remarks are too long', 'remarks');
  end if;

  update public.student_enrollments set
    tuition_fee = p_tuition_fee, admission_fee = p_admission_fee, registration_fee = p_registration_fee,
    additional_charges = p_additional_charges, discount = p_discount, scholarship = p_scholarship,
    fee_remarks = v_remarks
  where id = v_e.id;

  perform private.generate_installments(v_e.id, p_installment_count, p_first_due_date, p_interval_months);
  perform private.add_note(v_e.id, 'system', format('Fee updated: total %s (was %s), %s installment(s)',
    private.fmt_money(v_total), private.fmt_money(v_e.total_fee), coalesce(p_installment_count, 0)));
end $$;

-- Replaces the installment schedule with a custom one. Amounts must add up exactly to the total fee.
create or replace function public.save_installment_plan(p_enrollment_id uuid, p_installments jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_e public.student_enrollments;
  v_count int;
  v_sum numeric;
  v_item jsonb;
  v_i int := 0;
  v_prev date;
  v_due date;
  v_amount numeric;
begin
  perform private.require('fees.configure');
  select * into v_e from public.student_enrollments where id = p_enrollment_id for update;
  if not found then perform private.fail('Registration not found', null, 'PT404'); end if;
  if jsonb_typeof(p_installments) <> 'array' then perform private.fail('Invalid installment plan'); end if;
  v_count := jsonb_array_length(p_installments);
  if v_count > 36 then perform private.fail('At most 36 installments are allowed'); end if;
  if v_count = 0 and v_e.total_fee > 0 then perform private.fail('Add at least one installment'); end if;

  v_sum := 0;
  for v_item in select * from jsonb_array_elements(p_installments) loop
    v_i := v_i + 1;
    begin
      v_due := (v_item ->> 'due_date')::date;
      v_amount := (v_item ->> 'amount')::numeric;
    exception when others then
      perform private.fail(format('Installment %s has an invalid date or amount', v_i));
    end;
    if v_due is null or v_amount is null or v_amount <= 0 or scale(v_amount) > 2 then
      perform private.fail(format('Installment %s needs a due date and an amount greater than zero', v_i));
    end if;
    if v_prev is not null and v_due < v_prev then
      perform private.fail(format('Installment %s is due before installment %s', v_i, v_i - 1));
    end if;
    v_prev := v_due;
    v_sum := v_sum + v_amount;
  end loop;
  if v_sum <> v_e.total_fee then
    perform private.fail(format('Installments add up to %s but the total fee is %s',
      private.fmt_money(v_sum), private.fmt_money(v_e.total_fee)));
  end if;

  delete from public.fee_installments where enrollment_id = v_e.id;
  insert into public.fee_installments (enrollment_id, installment_no, due_date, amount, label)
  select v_e.id, ord::int, (x ->> 'due_date')::date, (x ->> 'amount')::numeric,
         nullif(left(private.clean_text(x ->> 'label'), 60), '')
  from jsonb_array_elements(p_installments) with ordinality as t (x, ord);
  update public.student_enrollments set installment_count = v_count where id = v_e.id;
  perform private.add_note(v_e.id, 'system', format('Installment plan updated (%s installments)', v_count));
end $$;

-- ---------------------------------------------------------------------
-- Course fees (courses.manage) - creates a new immutable version
-- ---------------------------------------------------------------------
create or replace function public.set_course_fee(
  p_course_id uuid,
  p_tuition_fee numeric,
  p_admission_fee numeric default 0,
  p_registration_fee numeric default 0,
  p_installment_count int default 1,
  p_interval_months int default 1,
  p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_cur public.fee_structures;
  v_id uuid;
begin
  perform private.require('courses.manage');
  if not exists (select 1 from public.courses where id = p_course_id) then
    perform private.fail('Course not found', null, 'PT404');
  end if;
  if p_tuition_fee is null or p_tuition_fee < 0 or coalesce(p_admission_fee, 0) < 0 or coalesce(p_registration_fee, 0) < 0
     or scale(p_tuition_fee) > 2 or scale(coalesce(p_admission_fee, 0)) > 2 or scale(coalesce(p_registration_fee, 0)) > 2
     or greatest(p_tuition_fee, p_admission_fee, p_registration_fee) > 99999999.99 then
    perform private.fail('Enter valid fee amounts (max 2 decimals, not negative)', 'tuition_fee');
  end if;
  if p_installment_count is null or p_installment_count not between 1 and 36 then
    perform private.fail('Installment count must be between 1 and 36', 'installment_count');
  end if;
  if p_interval_months is null or p_interval_months not between 1 and 12 then
    perform private.fail('Installment interval must be 1-12 months', 'interval_months');
  end if;

  select * into v_cur from public.fee_structures where course_id = p_course_id and is_current for update;
  if found and v_cur.tuition_fee = p_tuition_fee and v_cur.admission_fee = coalesce(p_admission_fee, 0)
     and v_cur.registration_fee = coalesce(p_registration_fee, 0) and v_cur.installment_count = p_installment_count
     and v_cur.installment_interval_months = p_interval_months then
    return v_cur.id;
  end if;
  update public.fee_structures set is_current = false where course_id = p_course_id and is_current;
  insert into public.fee_structures (
    course_id, tuition_fee, admission_fee, registration_fee, installment_count, installment_interval_months,
    effective_from, notes, created_by
  ) values (
    p_course_id, p_tuition_fee, coalesce(p_admission_fee, 0), coalesce(p_registration_fee, 0), p_installment_count,
    p_interval_months, private.today(), private.clean_text(p_notes), auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

-- Hard delete only for courses that were never used; otherwise mark inactive.
create or replace function public.delete_course(p_course_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require('courses.manage');
  if exists (select 1 from public.student_enrollments where course_id = p_course_id) then
    perform private.fail('This course has registrations. Deactivate it instead of deleting.', null, 'PT409');
  end if;
  delete from public.batches where course_id = p_course_id;
  delete from public.fee_structures where course_id = p_course_id;
  delete from public.courses where id = p_course_id;
end $$;

-- ---------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------
create or replace function private.receipt_json(p_receipt_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(r) from public.payment_receipts r where r.id = p_receipt_id;
$$;

create or replace function private.validate_payment_input(
  p_amount numeric, p_method public.payment_method, p_payment_date date, p_reference text, p_idempotency_key uuid
) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_idempotency_key is null then perform private.fail('Missing request key; reload and try again'); end if;
  if p_amount is null or p_amount <= 0 then perform private.fail('Amount must be greater than zero', 'amount'); end if;
  if scale(p_amount) > 2 or p_amount > 99999999.99 then perform private.fail('Enter a valid amount (max 2 decimals)', 'amount'); end if;
  if p_method is null then perform private.fail('Select a payment method', 'method'); end if;
  if p_payment_date is null or p_payment_date > private.today() then
    perform private.fail('Payment date cannot be in the future', 'payment_date');
  end if;
  if p_payment_date < private.today() - interval '2 years' then
    perform private.fail('Payment date is too far in the past', 'payment_date');
  end if;
  if p_method in ('upi', 'bank_transfer', 'card', 'cheque') and p_reference is null then
    perform private.fail('Transaction reference is required for this payment method', 'transaction_reference');
  end if;
  if char_length(p_reference) > 100 then perform private.fail('Reference is too long', 'transaction_reference'); end if;
end $$;

create or replace function private.issue_receipt(p_payment_id uuid, p_previous_balance numeric, p_remaining_balance numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.payment_receipts (
    receipt_no, payment_id, enrollment_id, kind, student_name, student_code, registration_no, course_title, batch_name,
    amount, payment_date, method, transaction_reference, total_fee, previous_balance, remaining_balance,
    issued_by, issued_by_name
  )
  select
    private.next_document_no(case when p.kind = 'payment' then 'RCT' else 'RFD' end),
    p.id, e.id, p.kind, s.full_name, s.student_code, e.registration_no, c.title, b.name,
    p.amount, p.payment_date, p.method, p.transaction_reference, e.total_fee, p_previous_balance, p_remaining_balance,
    au.id, au.full_name
  from public.fee_payments p
  join public.student_enrollments e on e.id = p.enrollment_id
  join public.students s on s.id = e.student_id
  join public.courses c on c.id = e.course_id
  left join public.batches b on b.id = e.batch_id
  left join public.admin_users au on au.id = auth.uid()
  where p.id = p_payment_id
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.record_payment(
  p_enrollment_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_payment_date date,
  p_idempotency_key uuid,
  p_transaction_reference text default null,
  p_remarks text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_e public.student_enrollments;
  v_bal record;
  v_ref text := private.clean_text(p_transaction_reference);
  v_remarks text := private.clean_text(p_remarks);
  v_payment_id uuid;
  v_receipt_id uuid;
begin
  perform private.require('payments.record');

  -- Same request key => same result; never records twice.
  select r.id into v_receipt_id from public.fee_payments p join public.payment_receipts r on r.payment_id = p.id
  where p.idempotency_key = p_idempotency_key;
  if v_receipt_id is not null then
    return private.receipt_json(v_receipt_id) || jsonb_build_object('replayed', true);
  end if;

  perform private.validate_payment_input(p_amount, p_method, p_payment_date, v_ref, p_idempotency_key);
  if char_length(v_remarks) > 500 then perform private.fail('Remarks are too long', 'remarks'); end if;

  select * into v_e from public.student_enrollments where id = p_enrollment_id for update;
  if not found then perform private.fail('Registration not found', null, 'PT404'); end if;
  if v_e.status in ('rejected', 'withdrawn') then
    perform private.fail('Payments cannot be recorded for a rejected or withdrawn registration');
  end if;

  select * into v_bal from private.enrollment_balance(v_e.id);
  if v_bal.balance <= 0 then
    perform private.fail('There is no outstanding balance for this registration', 'amount');
  end if;
  if p_amount > v_bal.balance then
    perform private.fail(format('Amount exceeds the outstanding balance of %s. Ask an administrator to adjust the fee first.',
      private.fmt_money(v_bal.balance)), 'amount');
  end if;

  begin
    insert into public.fee_payments (
      enrollment_id, kind, amount, payment_date, method, transaction_reference, remarks, idempotency_key, recorded_by
    ) values (
      v_e.id, 'payment', p_amount, p_payment_date, p_method, v_ref, v_remarks, p_idempotency_key, auth.uid()
    ) returning id into v_payment_id;
  exception when unique_violation then
    perform private.fail('This transaction reference has already been recorded', 'transaction_reference', 'PT409');
  end;

  v_receipt_id := private.issue_receipt(v_payment_id, v_bal.balance, v_bal.balance - p_amount);
  perform private.add_note(v_e.id, 'system', format('Payment of %s received by %s', private.fmt_money(p_amount),
    replace(p_method::text, '_', ' ')));
  return private.receipt_json(v_receipt_id) || jsonb_build_object('replayed', false);
end $$;

create or replace function public.record_refund(
  p_enrollment_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_payment_date date,
  p_idempotency_key uuid,
  p_transaction_reference text default null,
  p_remarks text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_e public.student_enrollments;
  v_bal record;
  v_ref text := private.clean_text(p_transaction_reference);
  v_remarks text := private.clean_text(p_remarks);
  v_payment_id uuid;
  v_receipt_id uuid;
begin
  perform private.require('payments.adjust');
  select r.id into v_receipt_id from public.fee_payments p join public.payment_receipts r on r.payment_id = p.id
  where p.idempotency_key = p_idempotency_key;
  if v_receipt_id is not null then
    return private.receipt_json(v_receipt_id) || jsonb_build_object('replayed', true);
  end if;

  perform private.validate_payment_input(p_amount, p_method, p_payment_date, v_ref, p_idempotency_key);
  if v_remarks is null or char_length(v_remarks) < 5 then
    perform private.fail('Enter the reason for the refund', 'remarks');
  end if;
  select * into v_e from public.student_enrollments where id = p_enrollment_id for update;
  if not found then perform private.fail('Registration not found', null, 'PT404'); end if;
  select * into v_bal from private.enrollment_balance(v_e.id);
  if p_amount > v_bal.net_paid then
    perform private.fail(format('Refund cannot exceed the amount paid (%s)', private.fmt_money(v_bal.net_paid)), 'amount');
  end if;

  insert into public.fee_payments (
    enrollment_id, kind, amount, payment_date, method, transaction_reference, remarks, idempotency_key, recorded_by
  ) values (
    v_e.id, 'refund', p_amount, p_payment_date, p_method, v_ref, v_remarks, p_idempotency_key, auth.uid()
  ) returning id into v_payment_id;

  v_receipt_id := private.issue_receipt(v_payment_id, v_bal.balance, v_bal.balance + p_amount);
  perform private.add_note(v_e.id, 'system', format('Refund of %s issued: %s', private.fmt_money(p_amount), v_remarks));
  return private.receipt_json(v_receipt_id) || jsonb_build_object('replayed', false);
end $$;

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_p public.fee_payments;
  v_bal record;
  v_reason text := private.clean_text(p_reason);
begin
  perform private.require('payments.adjust');
  if v_reason is null or char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    perform private.fail('Enter a reason (5-500 characters)', 'reason');
  end if;
  select * into v_p from public.fee_payments where id = p_payment_id;
  if not found then perform private.fail('Payment not found', null, 'PT404'); end if;
  perform 1 from public.student_enrollments where id = v_p.enrollment_id for update;
  if v_p.voided_at is not null then perform private.fail('Payment is already void', null, 'PT409'); end if;
  if v_p.kind = 'refund' then
    select * into v_bal from private.enrollment_balance(v_p.enrollment_id);
    if v_bal.balance - v_p.amount < 0 then
      perform private.fail('Voiding this refund would make the amount paid exceed the total fee');
    end if;
  end if;

  update public.fee_payments set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason where id = v_p.id;
  update public.payment_receipts set is_void = true where payment_id = v_p.id;
  perform private.add_note(v_p.enrollment_id, 'system',
    format('%s of %s voided: %s', initcap(v_p.kind::text), private.fmt_money(v_p.amount), v_reason));
end $$;
