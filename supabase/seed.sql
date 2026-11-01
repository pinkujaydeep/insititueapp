-- Local development sample data only. NOT applied to production (`supabase db push` does not run seeds).

update public.institute_settings set
  institute_name = 'Bright Future Institute',
  tagline = 'Skills for tomorrow, taught today',
  about = 'Bright Future Institute has trained thousands of learners in technology, accounting and professional skills with small batches, hands-on labs and placement support.',
  email = 'admissions@brightfuture.example',
  phone = '+91 98765 43210',
  whatsapp = '+91 98765 43210',
  address_line = '2nd Floor, Example Towers, MG Road',
  city = 'Bengaluru', state = 'Karnataka', postal_code = '560001',
  office_hours = 'Mon-Sat, 9:00 AM - 7:00 PM',
  privacy_policy = 'We collect the details you submit only to process your admission and contact you about it. We never sell your data. Contact us to view, correct or delete your information.',
  receipt_footer = 'Fees once paid are subject to the institute refund policy. This is a computer-generated receipt.',
  authorised_signatory = 'Accounts Officer'
where id = 1;

insert into public.course_categories (id, name, slug, sort_order) values
  ('10000000-0000-0000-0000-000000000001', 'Programming', 'programming', 1),
  ('10000000-0000-0000-0000-000000000002', 'Data & AI', 'data-ai', 2),
  ('10000000-0000-0000-0000-000000000003', 'Accounting & Finance', 'accounting-finance', 3);

insert into public.courses (id, code, title, category_id, short_description, description, eligibility, level,
  duration_value, duration_unit, highlights, max_capacity, is_featured, status) values
  ('20000000-0000-0000-0000-000000000001', 'WEB101', 'Full-Stack Web Development', '10000000-0000-0000-0000-000000000001',
   'Build and deploy modern web applications with React and Node.js.',
   'HTML, CSS, JavaScript, React, Node.js, databases and deployment. Every module ends with a project for your portfolio.',
   '12th pass or any graduate. Basic computer knowledge.', 'beginner', 6, 'months',
   array['Live projects', 'Placement assistance', 'Weekend batches'], 60, true, 'draft'),
  ('20000000-0000-0000-0000-000000000002', 'PY101', 'Python Programming', '10000000-0000-0000-0000-000000000001',
   'Learn Python from the basics to automation scripts.',
   'Python fundamentals, data structures, file handling, APIs and automation.',
   '10th pass and above.', 'beginner', 3, 'months', array['Hands-on labs', 'Certificate'], null, false, 'draft'),
  ('20000000-0000-0000-0000-000000000003', 'DS201', 'Data Science & Machine Learning', '10000000-0000-0000-0000-000000000002',
   'Analyse data and build machine learning models with Python.',
   'Pandas, NumPy, statistics, visualisation and machine learning with scikit-learn.',
   'Graduate with basic Python knowledge.', 'intermediate', 5, 'months', array['Capstone project', 'Industry mentors'], 30, true, 'draft'),
  ('20000000-0000-0000-0000-000000000004', 'TALLY01', 'Accounting with Tally Prime & GST', '10000000-0000-0000-0000-000000000003',
   'Practical accounting, GST returns and payroll using Tally Prime.',
   'Bookkeeping, Tally Prime, GST filing, TDS basics and payroll.',
   '12th pass (commerce preferred).', 'all_levels', 8, 'weeks', array['GST practicals', 'Job-ready'], null, false, 'draft');

insert into public.fee_structures (course_id, tuition_fee, admission_fee, registration_fee, installment_count, installment_interval_months) values
  ('20000000-0000-0000-0000-000000000001', 40000.00, 3000.00, 2000.00, 3, 1),
  ('20000000-0000-0000-0000-000000000002', 15000.00, 1500.00, 500.00, 2, 1),
  ('20000000-0000-0000-0000-000000000003', 50000.00, 3000.00, 2000.00, 4, 1),
  ('20000000-0000-0000-0000-000000000004', 10000.00, 1000.00, 500.00, 1, 1);

update public.courses set status = 'published';

insert into public.batches (course_id, name, start_date, end_date, schedule, mode, capacity) values
  ('20000000-0000-0000-0000-000000000001', 'Weekday Morning', current_date + 14, current_date + 194, 'Mon-Fri, 10:00 AM - 12:00 PM', 'classroom', 30),
  ('20000000-0000-0000-0000-000000000001', 'Weekend Online', current_date + 21, current_date + 201, 'Sat-Sun, 9:00 AM - 1:00 PM', 'online', 30),
  ('20000000-0000-0000-0000-000000000003', 'Evening Batch', current_date + 30, current_date + 180, 'Mon-Thu, 6:30 PM - 8:30 PM', 'hybrid', 30);
