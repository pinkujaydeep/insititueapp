import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Copy, Printer, Send } from "lucide-react";
import { toAppError } from "../../lib/errors";
import { formatDate, formatDateTime, formatMoney, GENDER_LABELS, MODE_LABELS, type Gender } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { PublicCourse, RegistrationResult } from "../../lib/types";
import {
  emptyRegistration, fieldFromHint, normalizeMobile, validateRegistration, type FieldErrors, type RegistrationForm as Form,
} from "../../lib/validation";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Feedback";
import { Field } from "../ui/Field";

const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

const QUALIFICATIONS = ["10th / SSLC", "12th / PUC", "Diploma", "Graduate", "Post Graduate", "Other"];

interface Props {
  courses: PublicCourse[];
  selectedCourseId: string;
  onShowPrivacy: () => void;
}

export function RegistrationForm({ courses, selectedCourseId, onShowPrivacy }: Props) {
  const [form, setForm] = useState<Form>(emptyRegistration);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const clientToken = useRef(crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (selectedCourseId) {
      setForm((f) => ({ ...f, course_id: selectedCourseId, batch_id: "" }));
      setResult(null);
    }
  }, [selectedCourseId]);

  const course = useMemo(() => courses.find((c) => c.id === form.course_id), [courses, form.course_id]);
  const openBatches = course?.batches.filter((b) => b.seats_left !== 0) ?? [];

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value, ...(key === "course_id" ? { batch_id: "" } : {}) }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const text = (key: keyof Form) => ({
    value: form[key] as string,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
  });

  const focusFirstError = (errs: FieldErrors) => {
    const first = Object.keys(errs)[0];
    if (!first) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    const errs = validateRegistration(form, { batchRequired: (course?.batches.length ?? 0) > 0 });
    if (Object.keys(errs).length) {
      setErrors(errs);
      setFormError("Please correct the highlighted fields.");
      focusFirstError(errs);
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("submit_registration", {
        p_full_name: form.full_name.trim(),
        p_email: form.email.trim(),
        p_mobile: normalizeMobile(form.mobile) ?? form.mobile,
        p_alt_mobile: form.alt_mobile.trim() ? normalizeMobile(form.alt_mobile) ?? form.alt_mobile : undefined,
        p_date_of_birth: form.date_of_birth || undefined,
        p_gender: (form.gender || undefined) as Gender | undefined,
        p_city: form.city.trim(),
        p_state: form.state.trim(),
        p_postal_code: form.postal_code.trim(),
        p_highest_qualification: form.highest_qualification.trim(),
        p_institution_name: form.institution_name.trim() || undefined,
        p_course_id: form.course_id,
        p_batch_id: form.batch_id || undefined,
        p_message: form.message.trim() || undefined,
        p_privacy_consent: form.privacy_consent,
        p_client_token: clientToken.current,
        p_website: form.website || undefined,
      });
      if (error) throw error;
      setResult(data as unknown as RegistrationResult);
      setForm(emptyRegistration);
      setErrors({});
      clientToken.current = crypto.randomUUID();
      requestAnimationFrame(() => document.getElementById("register")?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) {
      const appError = toAppError(err);
      const field = fieldFromHint(appError.field);
      if (field) {
        setErrors({ [field]: appError.message });
        focusFirstError({ [field]: appError.message });
      }
      setFormError(appError.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (result) return <RegistrationSuccess result={result} onAnother={() => setResult(null)} />;

  return (
    <form ref={formRef} className="card form registration-form" onSubmit={submit} noValidate aria-describedby="form-status">
      <div id="form-status" aria-live="polite">
        {formError && <Alert>{formError}</Alert>}
      </div>

      <fieldset>
        <legend>Personal information</legend>
        <div className="grid-2">
          <Field label="Full name" required error={errors.full_name}>
            <input name="full_name" autoComplete="name" maxLength={100} {...text("full_name")} />
          </Field>
          <Field label="Date of birth" error={errors.date_of_birth}>
            <input name="date_of_birth" type="date" autoComplete="bday" {...text("date_of_birth")} />
          </Field>
          <Field label="Gender" error={errors.gender}>
            <select name="gender" {...text("gender")}>
              <option value="">Prefer not to say</option>
              {(Object.keys(GENDER_LABELS) as Gender[]).filter((g) => g !== "prefer_not_to_say").map((g) => (
                <option key={g} value={g}>{GENDER_LABELS[g]}</option>
              ))}
            </select>
          </Field>
          <Field label="Email address" required error={errors.email}>
            <input name="email" type="email" autoComplete="email" maxLength={200} {...text("email")} />
          </Field>
          <Field label="Mobile number" required error={errors.mobile} hint="10-digit Indian number, or +country code">
            <input name="mobile" type="tel" autoComplete="tel" inputMode="tel" maxLength={20} {...text("mobile")} />
          </Field>
          <Field label="Alternate mobile" error={errors.alt_mobile}>
            <input name="alt_mobile" type="tel" inputMode="tel" maxLength={20} {...text("alt_mobile")} />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Address</legend>
        <div className="grid-3">
          <Field label="City" required error={errors.city}>
            <input name="city" autoComplete="address-level2" maxLength={80} {...text("city")} />
          </Field>
          <Field label="State" required error={errors.state}>
            <input name="state" list="state-list" autoComplete="address-level1" maxLength={80} {...text("state")} />
          </Field>
          <Field label="PIN / Postal code" required error={errors.postal_code}>
            <input name="postal_code" autoComplete="postal-code" inputMode="numeric" maxLength={10} {...text("postal_code")} />
          </Field>
        </div>
        <datalist id="state-list">
          {STATES.map((s) => <option key={s} value={s} />)}
        </datalist>
      </fieldset>

      <fieldset>
        <legend>Education</legend>
        <div className="grid-2">
          <Field label="Highest qualification" required error={errors.highest_qualification}>
            <input name="highest_qualification" list="qualification-list" maxLength={120} {...text("highest_qualification")} />
          </Field>
          <Field label="Institution name" error={errors.institution_name}>
            <input name="institution_name" maxLength={150} {...text("institution_name")} />
          </Field>
        </div>
        <datalist id="qualification-list">
          {QUALIFICATIONS.map((q) => <option key={q} value={q} />)}
        </datalist>
      </fieldset>

      <fieldset>
        <legend>Course</legend>
        <div className="grid-2">
          <Field label="Course" required error={errors.course_id}>
            <select name="course_id" {...text("course_id")}>
              <option value="">Select a course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id} disabled={c.seats_left === 0}>
                  {c.title}{c.seats_left === 0 ? " (full)" : ""}
                </option>
              ))}
            </select>
          </Field>
          {course && course.batches.length > 0 && (
            <Field label="Batch" required error={errors.batch_id}>
              <select name="batch_id" {...text("batch_id")}>
                <option value="">Select a batch</option>
                {openBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {MODE_LABELS[b.mode]} · starts {formatDate(b.start_date)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {course && (
          <div className="fee-summary" aria-live="polite">
            <div><span>Tuition</span><strong>{formatMoney(course.tuition_fee)}</strong></div>
            {course.admission_fee > 0 && <div><span>Admission</span><strong>{formatMoney(course.admission_fee)}</strong></div>}
            {course.registration_fee > 0 && <div><span>Registration</span><strong>{formatMoney(course.registration_fee)}</strong></div>}
            <div className="fee-total"><span>Total course fee</span><strong>{formatMoney(course.total_fee)}</strong></div>
            {course.installment_count > 1 && <p className="muted small">Payable in {course.installment_count} installments.</p>}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Additional information</legend>
        <Field label="Message or questions" error={errors.message}>
          <textarea name="message" rows={3} maxLength={2000} {...text("message")} />
        </Field>
        {/* Honeypot for bots: hidden from people and assistive technology */}
        <div className="hp" aria-hidden="true">
          <label>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" {...text("website")} />
          </label>
        </div>
        <div className={`checkbox-field${errors.privacy_consent ? " has-error" : ""}`}>
          <label>
            <input
              name="privacy_consent"
              type="checkbox"
              checked={form.privacy_consent}
              onChange={(e) => set("privacy_consent", e.target.checked)}
              aria-invalid={errors.privacy_consent ? true : undefined}
              aria-describedby={errors.privacy_consent ? "consent-error" : undefined}
            />
            <span>
              I agree to the{" "}
              <button type="button" className="link" onClick={onShowPrivacy}>
                privacy policy
              </button>{" "}
              and consent to being contacted about my application.
            </span>
          </label>
          {errors.privacy_consent && <small id="consent-error" className="field-error">{errors.privacy_consent}</small>}
        </div>
      </fieldset>

      <Button type="submit" size="lg" variant="accent" block loading={submitting} icon={<Send size={18} />}>
        {submitting ? "Submitting your application..." : "Submit application"}
      </Button>
      <p className="muted small center">We will never share your details with third parties.</p>
    </form>
  );
}

function RegistrationSuccess({ result, onAnother }: { result: RegistrationResult; onAnother: () => void }) {
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.registration_no);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="card success-card" role="status">
      <div className="success-icon"><CheckCircle2 size={44} aria-hidden /></div>
      <h3 ref={headingRef} tabIndex={-1}>Application received!</h3>
      <p>
        Thank you, <strong>{result.full_name}</strong>. Your application for <strong>{result.course_title}</strong> has been
        submitted successfully.
      </p>
      <div className="reference-box">
        <span className="muted small">Your registration number</span>
        <div className="reference-number">{result.registration_no}</div>
        <Button variant="ghost" size="sm" icon={<Copy size={14} />} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <dl className="summary-list">
        <div><dt>Student ID</dt><dd>{result.student_code}</dd></div>
        <div><dt>Course</dt><dd>{result.course_title}</dd></div>
        {result.batch_name && <div><dt>Batch</dt><dd>{result.batch_name}</dd></div>}
        <div><dt>Course fee</dt><dd>{formatMoney(result.total_fee)}</dd></div>
        <div><dt>Submitted</dt><dd>{formatDateTime(result.submitted_at)}</dd></div>
      </dl>
      <div className="next-steps">
        <h4>What happens next?</h4>
        <ol>
          <li>Our admissions team will contact you within 2 working days.</li>
          <li>Keep your registration number handy for all communication.</li>
          <li>Fee payment details will be shared with you once your admission is confirmed.</li>
        </ol>
      </div>
      <div className="success-actions">
        <Button variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>
          Print
        </Button>
        <Button onClick={onAnother}>Apply for another course</Button>
      </div>
    </div>
  );
}
