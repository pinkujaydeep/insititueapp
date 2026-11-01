import { useEffect, useState, type FormEvent } from "react";
import { ImagePlus, KeyRound, Save } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/FeedbackProvider";
import { Field } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/Layout";
import { useAuth } from "../../hooks/useAuth";
import { useSettings } from "../../hooks/useSettings";
import { toAppError, unwrap } from "../../lib/errors";
import { PUBLIC_BUCKET, supabase } from "../../lib/supabase";
import type { InstituteSettings } from "../../lib/types";
import type { Database } from "../../lib/database.types";
import { validateNewPassword } from "./AuthPages";

type InstituteSettingsUpdate = Database["public"]["Tables"]["institute_settings"]["Update"];

const TEXT_FIELDS: { key: keyof InstituteSettings; label: string; max: number; type?: string; wide?: boolean }[] = [
  { key: "institute_name", label: "Institute name", max: 150 },
  { key: "tagline", label: "Tagline", max: 200 },
  { key: "email", label: "Email", max: 200, type: "email" },
  { key: "phone", label: "Phone", max: 30, type: "tel" },
  { key: "alt_phone", label: "Alternate phone", max: 30, type: "tel" },
  { key: "whatsapp", label: "WhatsApp number", max: 30, type: "tel" },
  { key: "address_line", label: "Address", max: 300, wide: true },
  { key: "city", label: "City", max: 80 },
  { key: "state", label: "State", max: 80 },
  { key: "postal_code", label: "PIN code", max: 12 },
  { key: "website", label: "Website", max: 200 },
  { key: "office_hours", label: "Office hours", max: 200 },
  { key: "tax_id", label: "GSTIN / Tax ID", max: 30 },
  { key: "authorised_signatory", label: "Authorised signatory (receipts)", max: 100 },
  { key: "receipt_footer", label: "Receipt footer note", max: 500, wide: true },
];

export default function SettingsPage() {
  const { can } = useAuth();
  return (
    <>
      <PageHeader title="Settings" />
      {can("settings.manage") && <InstituteProfileForm />}
      <MyAccount />
    </>
  );
}

function InstituteProfileForm() {
  const { settings, logoUrl, reload } = useSettings();
  const toast = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const f: Record<string, string> = {};
    for (const { key } of TEXT_FIELDS) f[key] = (settings[key] as string | null) ?? "";
    f.about = settings.about ?? "";
    f.privacy_policy = settings.privacy_policy ?? "";
    setForm(f);
  }, [settings]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if ((form.institute_name ?? "").trim().length < 2) return setError("Institute name is required");
    if (logo && (!["image/png", "image/jpeg", "image/webp"].includes(logo.type) || logo.size > 2 * 1024 * 1024)) {
      return setError("Logo must be PNG, JPG or WebP up to 2 MB");
    }
    setBusy(true);
    setError(null);
    try {
      let logoPath = settings?.logo_path ?? null;
      if (logo) {
        const path = `branding/logo-${crypto.randomUUID()}.${logo.type.split("/")[1].replace("jpeg", "jpg")}`;
        const { error: upErr } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, logo, { contentType: logo.type });
        if (upErr) throw upErr;
        logoPath = path;
      }
      const payload: Record<string, string | null> = { logo_path: logoPath };
      for (const [k, v] of Object.entries(form)) payload[k] = v.trim() || null;
      payload.institute_name = form.institute_name.trim();
      await unwrap(supabase.from("institute_settings").update(payload as InstituteSettingsUpdate).eq("id", 1).select().single());
      if (logo && settings?.logo_path) await supabase.storage.from(PUBLIC_BUCKET).remove([settings.logo_path]);
      toast("Institute profile saved");
      setLogo(null);
      reload();
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section className="card">
      <h2 className="card-title">Institute profile</h2>
      <p className="muted small">Shown on the public website and printed on receipts.</p>
      <form className="form" onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="logo-row">
          {logoUrl ? <img src={logoUrl} alt="Current logo" className="logo-preview" /> : <span className="brand-mark brand-mark-lg" aria-hidden>{settings?.institute_name?.charAt(0)}</span>}
          <label className="file-input">
            <ImagePlus size={16} aria-hidden />
            <span>{logo ? logo.name : "Upload logo"}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <div className="grid-3">
          {TEXT_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} className={f.wide ? "span-3" : ""} required={f.key === "institute_name"}>
              <input type={f.type ?? "text"} maxLength={f.max} value={form[f.key] ?? ""} onChange={set(f.key)} />
            </Field>
          ))}
        </div>
        <Field label="About the institute">
          <textarea rows={4} maxLength={4000} value={form.about ?? ""} onChange={set("about")} />
        </Field>
        <Field label="Privacy policy" hint="Shown to students before they submit the registration form">
          <textarea rows={6} maxLength={20000} value={form.privacy_policy ?? ""} onChange={set("privacy_policy")} />
        </Field>
        <div className="form-actions">
          <Button type="submit" loading={busy} icon={<Save size={16} />}>Save profile</Button>
        </div>
      </form>
    </section>
  );
}

function MyAccount() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"name" | "password" | null>(null);

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setBusy("name");
    const { error: err } = await supabase.from("admin_users").update({ full_name: name.trim() }).eq("id", profile!.id);
    setBusy(null);
    if (err) toast(toAppError(err).message, "error");
    else {
      toast("Name updated");
      void refreshProfile();
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    if (problem) return setError(problem);
    setError(null);
    setBusy("password");
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(null);
    if (err) {
      setError(/reauthentication|recent/i.test(err.message) ? "For security, sign out and sign in again before changing your password." : err.message);
      return;
    }
    toast("Password changed");
    setPassword("");
    setConfirm("");
  };

  return (
    <section className="card">
      <h2 className="card-title">My account</h2>
      <div className="grid-2">
        <form className="form" onSubmit={saveName}>
          <Field label="Email"><input value={profile?.email ?? ""} disabled /></Field>
          <Field label="Display name"><input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></Field>
          <div><Button type="submit" variant="secondary" loading={busy === "name"}>Update name</Button></div>
        </form>
        <form className="form" onSubmit={savePassword} noValidate>
          {error && <Alert>{error}</Alert>}
          <Field label="New password" hint="8+ characters with letters and numbers">
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm new password"><input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <div><Button type="submit" loading={busy === "password"} icon={<KeyRound size={16} />}>Change password</Button></div>
        </form>
      </div>
    </section>
  );
}
