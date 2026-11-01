-- =====================================================================
-- 004 - Dashboard & financial reports (calculated from live records)
-- =====================================================================

-- Fee position for every enrollment. Installments are settled oldest-first (FIFO).
create or replace function private.enrollment_fees()
returns table (
  enrollment_id uuid, student_id uuid, course_id uuid, batch_id uuid, status public.admission_status,
  created_at timestamptz, total_fee numeric, net_paid numeric, amount_refunded numeric, balance numeric,
  next_due_date date, overdue_amount numeric, oldest_overdue_date date, payment_status text
) language sql stable security definer set search_path = '' as $$
  select
    e.id, e.student_id, e.course_id, e.batch_id, e.status, e.created_at, e.total_fee,
    f.net_paid, f.refunded, e.total_fee - f.net_paid,
    nx.next_due_date,
    case when bill.yes then greatest(0, coalesce(od.due, 0) - f.net_paid) else 0 end,
    case when bill.yes and nx.next_due_date < private.today() then nx.next_due_date end,
    case
      when f.refunded > 0 and f.net_paid <= 0 then 'refunded'
      when e.total_fee - f.net_paid <= 0 then 'paid'
      when bill.yes and coalesce(od.due, 0) - f.net_paid > 0 then 'overdue'
      when f.net_paid > 0 then 'partially_paid'
      else 'pending'
    end
  from public.student_enrollments e
  cross join lateral (select e.status = any (private.seat_statuses()) as yes) bill
  cross join lateral (
    select
      coalesce(sum(p.amount) filter (where p.kind = 'refund'), 0) as refunded,
      coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0) as net_paid
    from public.fee_payments p where p.enrollment_id = e.id and p.voided_at is null
  ) f
  left join lateral (
    select min(x.due_date) as next_due_date
    from (
      select i.due_date, sum(i.amount) over (order by i.installment_no) as cumulative
      from public.fee_installments i where i.enrollment_id = e.id
    ) x
    where x.cumulative > f.net_paid
  ) nx on true
  left join lateral (
    select sum(i.amount) as due from public.fee_installments i
    where i.enrollment_id = e.id and i.due_date < private.today()
  ) od on true;
$$;

create or replace function private.check_range(p_from date, p_to date)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_from is null or p_to is null then perform private.fail('Select a date range', 'from'); end if;
  if p_from > p_to then perform private.fail('Start date must be before end date', 'from'); end if;
  if p_to - p_from > 3700 then perform private.fail('Date range cannot exceed 10 years', 'from'); end if;
end $$;

-- ---------------------------------------------------------------------
-- Dashboard. Financial figures are only returned to roles with fees.read.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_summary(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := private.today();
  v_tz text := coalesce((select timezone from public.institute_settings where id = 1), 'Asia/Kolkata');
  v_from date := coalesce(p_from, (date_trunc('month', v_today) - interval '11 months')::date);
  v_to date := coalesce(p_to, v_today);
  v_fees boolean := private.can('fees.read');
begin
  if not private.is_staff() then
    raise exception using message = 'You do not have permission to perform this action', errcode = '42501';
  end if;
  perform private.check_range(v_from, v_to);

  return (
    with ef as (select * from private.enrollment_fees()),
    reg as (
      select e.*, (e.created_at at time zone v_tz)::date as created_day
      from public.student_enrollments e
    ),
    pay as (
      select p.payment_date, case when p.kind = 'payment' then p.amount else -p.amount end as net
      from public.fee_payments p where p.voided_at is null
    ),
    months as (
      select gs::date as m from generate_series(date_trunc('month', v_from), date_trunc('month', v_to), interval '1 month') gs
    )
    select jsonb_build_object(
      'range', jsonb_build_object('from', v_from, 'to', v_to),
      'can_view_fees', v_fees,
      'cards', jsonb_build_object(
        'total_students', (select count(*) from public.students),
        'active_students', (
          select count(distinct e.student_id) from public.student_enrollments e
          left join public.batches b on b.id = e.batch_id
          where e.status = 'enrolled' and (b.end_date is null or b.end_date >= v_today)),
        'total_enquiries', (select count(*) from reg),
        'enrolled_students', (select count(distinct student_id) from reg where status = 'enrolled'),
        'active_courses', (select count(*) from public.courses where status = 'published'),
        'new_registrations_this_month', (select count(*) from reg where created_day >= date_trunc('month', v_today)::date),
        'period_registrations', (select count(*) from reg where created_day between v_from and v_to),
        'fees_collected', case when v_fees then (select coalesce(sum(net), 0) from pay) end,
        'period_collected', case when v_fees then (select coalesce(sum(net), 0) from pay where payment_date between v_from and v_to) end,
        'outstanding', case when v_fees then
          (select coalesce(sum(greatest(balance, 0)), 0) from ef where status = any (private.seat_statuses())) end,
        'overdue', case when v_fees then (select coalesce(sum(overdue_amount), 0) from ef) end
      ),
      'monthly_registrations', (
        select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'value', (
          select count(*) from reg
          where created_day >= m and created_day < (m + interval '1 month')::date and created_day between v_from and v_to
        )) order by m) from months),
      'monthly_collections', case when v_fees then (
        select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'value', (
          select coalesce(sum(net), 0) from pay
          where payment_date >= m and payment_date < (m + interval '1 month')::date and payment_date between v_from and v_to
        )) order by m) from months) end,
      'course_distribution', coalesce((
        select jsonb_agg(jsonb_build_object('course', t.title, 'code', t.code, 'total', t.total, 'enrolled', t.enrolled)
                         order by t.total desc)
        from (
          select c.title, c.code, count(*) as total, count(*) filter (where r.status = 'enrolled') as enrolled
          from reg r join public.courses c on c.id = r.course_id
          where r.created_day between v_from and v_to
          group by c.id, c.title, c.code
        ) t), '[]'),
      'fee_status', case when v_fees then jsonb_build_object(
        'collected', (select coalesce(sum(net_paid), 0) from ef where status = any (private.seat_statuses())),
        'outstanding', (select coalesce(sum(greatest(balance, 0)), 0) from ef where status = any (private.seat_statuses())),
        'by_status', coalesce((
          select jsonb_object_agg(payment_status, jsonb_build_object('count', n, 'balance', bal))
          from (
            select payment_status, count(*) as n, sum(greatest(balance, 0)) as bal
            from ef where status = any (private.seat_statuses()) group by payment_status
          ) s), '{}')
      ) end,
      'conversion', (
        select jsonb_build_object(
          'total', coalesce(sum(n), 0),
          'by_status', coalesce(jsonb_object_agg(status, n) filter (where status is not null), '{}'),
          'enrolled', coalesce(sum(n) filter (where status = 'enrolled'), 0),
          'rate', case when sum(n) > 0 then round(100.0 * coalesce(sum(n) filter (where status = 'enrolled'), 0) / sum(n), 1) else 0 end
        )
        from (select status, count(*) as n from reg where created_day between v_from and v_to group by status) s
      )
    )
  );
end $$;

-- ---------------------------------------------------------------------
-- Collection report: day / week / month / year
-- ---------------------------------------------------------------------
create or replace function public.report_collections(p_from date, p_to date, p_period text default 'day')
returns table (period_start date, period_label text, payments_count bigint, collected numeric, refunded numeric, net numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require('reports.view');
  perform private.check_range(p_from, p_to);
  if p_period not in ('day', 'week', 'month', 'year') then
    perform private.fail('Period must be day, week, month or year', 'period');
  end if;
  return query
  with series as (
    select gs::date as ps
    from generate_series(date_trunc(p_period, p_from), date_trunc(p_period, p_to), ('1 ' || p_period)::interval) gs
  )
  select
    s.ps,
    case p_period
      when 'day' then to_char(s.ps, 'DD Mon YYYY')
      when 'week' then 'Week of ' || to_char(s.ps, 'DD Mon YYYY')
      when 'month' then to_char(s.ps, 'Mon YYYY')
      else to_char(s.ps, 'YYYY')
    end,
    count(p.id) filter (where p.kind = 'payment'),
    coalesce(sum(p.amount) filter (where p.kind = 'payment'), 0),
    coalesce(sum(p.amount) filter (where p.kind = 'refund'), 0),
    coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0)
  from series s
  left join public.fee_payments p
    on p.voided_at is null and p.payment_date between p_from and p_to
    and date_trunc(p_period, p.payment_date)::date = s.ps
  group by s.ps
  order by s.ps;
end $$;

create or replace function public.report_payment_methods(p_from date, p_to date)
returns table (method public.payment_method, payments_count bigint, collected numeric, refunded numeric, net numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require('reports.view');
  perform private.check_range(p_from, p_to);
  return query
  select m.method,
    count(p.id) filter (where p.kind = 'payment'),
    coalesce(sum(p.amount) filter (where p.kind = 'payment'), 0),
    coalesce(sum(p.amount) filter (where p.kind = 'refund'), 0),
    coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0)
  from unnest(enum_range(null::public.payment_method)) as m (method)
  left join public.fee_payments p
    on p.method = m.method and p.voided_at is null and p.payment_date between p_from and p_to
  group by m.method
  order by m.method;
end $$;

create or replace function public.report_course_revenue(p_from date, p_to date)
returns table (
  course_id uuid, course_code text, course_title text, course_status public.course_status,
  registrations bigint, billable_enrollments bigint, billed numeric, collected_total numeric,
  collected_in_period numeric, outstanding numeric
) language plpgsql stable security definer set search_path = '' as $$
declare v_tz text := coalesce((select timezone from public.institute_settings where id = 1), 'Asia/Kolkata');
begin
  perform private.require('reports.view');
  perform private.check_range(p_from, p_to);
  return query
  with ef as (select * from private.enrollment_fees())
  select c.id, c.code, c.title, c.status,
    (select count(*) from public.student_enrollments e
      where e.course_id = c.id and (e.created_at at time zone v_tz)::date between p_from and p_to),
    (select count(*) from ef where ef.course_id = c.id and ef.status = any (private.seat_statuses())),
    (select coalesce(sum(ef.total_fee), 0) from ef where ef.course_id = c.id and ef.status = any (private.seat_statuses())),
    (select coalesce(sum(ef.net_paid), 0) from ef where ef.course_id = c.id),
    (select coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0)
      from public.fee_payments p join public.student_enrollments e on e.id = p.enrollment_id
      where e.course_id = c.id and p.voided_at is null and p.payment_date between p_from and p_to),
    (select coalesce(sum(greatest(ef.balance, 0)), 0) from ef
      where ef.course_id = c.id and ef.status = any (private.seat_statuses()))
  from public.courses c
  where c.status = 'published' or exists (select 1 from public.student_enrollments e where e.course_id = c.id)
  order by c.title;
end $$;

create or replace function public.report_outstanding(p_course_id uuid default null, p_overdue_only boolean default false)
returns table (
  enrollment_id uuid, registration_no text, student_id uuid, student_code text, student_name text, mobile text,
  email text, course_title text, batch_name text, status public.admission_status, total_fee numeric,
  net_paid numeric, balance numeric, next_due_date date, overdue_amount numeric, oldest_overdue_date date,
  days_overdue int, payment_status text
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require('reports.view');
  return query
  select ef.enrollment_id, e.registration_no, s.id, s.student_code, s.full_name, s.mobile, s.email, c.title, b.name,
    ef.status, ef.total_fee, ef.net_paid, ef.balance, ef.next_due_date, ef.overdue_amount, ef.oldest_overdue_date,
    case when ef.oldest_overdue_date is not null then private.today() - ef.oldest_overdue_date end,
    ef.payment_status
  from private.enrollment_fees() ef
  join public.student_enrollments e on e.id = ef.enrollment_id
  join public.students s on s.id = ef.student_id
  join public.courses c on c.id = ef.course_id
  left join public.batches b on b.id = ef.batch_id
  where ef.status = any (private.seat_statuses())
    and ef.balance > 0
    and (p_course_id is null or ef.course_id = p_course_id)
    and (not p_overdue_only or ef.overdue_amount > 0)
  order by
    case when p_overdue_only then private.today() - ef.oldest_overdue_date end desc nulls last,
    ef.balance desc;
end $$;
