// Client-side validation mirrors the database rules for instant feedback. The database re-validates everything.

export const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

/** Returns +<digits> for valid Indian (10-digit) or international numbers, otherwise null. */
export function normalizeMobile(value: string): string | null {
  const d = value.replace(/[\s().-]/g, "");
  if (/^[6-9]\d{9}$/.test(d)) return `+91${d}`;
  if (/^(\+91|0091|91|0)[6-9]\d{9}$/.test(d)) return `+91${d.slice(-10)}`;
  if (/^(\+|00)91/.test(d)) return null;
  if (/^(\+|00)[1-9]\d{7,14}$/.test(d)) return `+${d.replace(/^(\+|00)/, "")}`;
  return null;
}

export interface RegistrationForm {
  full_name: string;
  date_of_birth: string;
  gender: string;
  email: string;
  mobile: string;
  alt_mobile: string;
  city: string;
  state: string;
  postal_code: string;
  highest_qualification: string;
  institution_name: string;
  course_id: string;
  batch_id: string;
  message: string;
  privacy_consent: boolean;
  website: string;
}

export const emptyRegistration: RegistrationForm = {
  full_name: "",
  date_of_birth: "",
  gender: "",
  email: "",
  mobile: "",
  alt_mobile: "",
  city: "",
  state: "",
  postal_code: "",
  highest_qualification: "",
  institution_name: "",
  course_id: "",
  batch_id: "",
  message: "",
  privacy_consent: false,
  website: "",
};

export type FieldErrors = Partial<Record<keyof RegistrationForm, string>>;

export function validateRegistration(form: RegistrationForm, opts: { batchRequired: boolean; today?: Date }): FieldErrors {
  const errors: FieldErrors = {};
  const today = opts.today ?? new Date();
  const name = form.full_name.trim();
  if (name.length < 2 || name.length > 100 || /[0-9@#$%^*_=+{}[\]|\\/~`<>]/.test(name)) {
    errors.full_name = "Enter your full name (2-100 letters)";
  }
  if (!EMAIL_RE.test(form.email.trim()) || form.email.trim().length > 200) errors.email = "Enter a valid email address";
  const mobile = normalizeMobile(form.mobile);
  if (!mobile) errors.mobile = "Enter a valid 10-digit mobile number (or +country code)";
  if (form.alt_mobile.trim()) {
    const alt = normalizeMobile(form.alt_mobile);
    if (!alt) errors.alt_mobile = "Enter a valid alternate mobile number";
    else if (alt === mobile) errors.alt_mobile = "Alternate mobile must be different";
  }
  if (form.date_of_birth) {
    const dob = new Date(form.date_of_birth);
    const age = (today.getTime() - dob.getTime()) / (365.25 * 864e5);
    if (Number.isNaN(age) || age < 10 || age > 100) errors.date_of_birth = "Enter a valid date of birth";
  }
  if (form.city.trim().length < 2) errors.city = "Enter your city";
  if (form.state.trim().length < 2) errors.state = "Enter your state";
  const pin = form.postal_code.trim().toUpperCase();
  if (mobile?.startsWith("+91") ? !/^[1-9]\d{5}$/.test(pin) : !/^[A-Z0-9][A-Z0-9 -]{2,9}$/.test(pin)) {
    errors.postal_code = mobile?.startsWith("+91") ? "Enter a valid 6-digit PIN code" : "Enter a valid postal code";
  }
  if (form.highest_qualification.trim().length < 2) errors.highest_qualification = "Enter your highest qualification";
  if (form.institution_name.length > 150) errors.institution_name = "Institution name is too long";
  if (!form.course_id) errors.course_id = "Select a course";
  if (opts.batchRequired && !form.batch_id) errors.batch_id = "Select a batch";
  if (form.message.length > 2000) errors.message = "Message must be under 2000 characters";
  if (!form.privacy_consent) errors.privacy_consent = "Please accept the privacy policy to continue";
  return errors;
}

/** Maps database parameter names (hint) back to form fields. */
export function fieldFromHint(hint: string | undefined): keyof RegistrationForm | undefined {
  if (!hint) return undefined;
  const map: Record<string, keyof RegistrationForm> = { message: "message" };
  return (map[hint] ?? (hint in emptyRegistration ? hint : undefined)) as keyof RegistrationForm | undefined;
}
