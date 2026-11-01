import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { ArrowLeft, KeyRound, LogIn, MailCheck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";
import { useAuth } from "../../hooks/useAuth";
import { useSettings } from "../../hooks/useSettings";
import { toAppError } from "../../lib/errors";
import { supabase } from "../../lib/supabase";

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { settings, logoUrl } = useSettings();
  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-brand">
          {logoUrl ? <img src={logoUrl} alt="" className="brand-logo" /> : <span className="brand-mark" aria-hidden>{settings?.institute_name?.charAt(0) ?? "I"}</span>}
          <span>{settings?.institute_name}</span>
        </div>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { session, profile, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session && profile && profile.roles.length > 0) return <Navigate to="/admin" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith("/admin") ? from : "/admin", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : toAppError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Staff sign in" subtitle="Sign in to the administration portal.">
      <form className="form" onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Email" required>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Password" required>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" block size="lg" loading={busy} icon={<LogIn size={18} />}>
          Sign in
        </Button>
        <div className="auth-links">
          <Link to="/admin/forgot-password">Forgot password?</Link>
          <Link to="/"><ArrowLeft size={14} aria-hidden /> Back to website</Link>
        </div>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Enter a valid email address");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });
    setBusy(false);
    // Always show the same message so the form cannot be used to discover staff accounts.
    if (err && err.status === 429) setError("Too many requests. Please wait a few minutes and try again.");
    else setSent(true);
  };

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a secure link to set a new password.">
      {sent ? (
        <div className="form">
          <Alert tone="success">
            <MailCheck size={16} aria-hidden /> If an account exists for <strong>{email}</strong>, a reset link has been sent.
            Check your inbox and spam folder.
          </Alert>
          <Link to="/admin/login" className="btn btn-secondary btn-md btn-block">Back to sign in</Link>
        </div>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          {error && <Alert>{error}</Alert>}
          <Field label="Email" required>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Button type="submit" block loading={busy}>Send reset link</Button>
          <div className="auth-links">
            <Link to="/admin/login"><ArrowLeft size={14} aria-hidden /> Back to sign in</Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password must contain letters and numbers";
  if (password !== confirm) return "Passwords do not match";
  return null;
}

export function ResetPasswordPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message);
    else navigate("/admin", { replace: true });
  };

  if (!session) {
    return (
      <AuthShell title="Link expired" subtitle="This password reset link is invalid or has expired.">
        <Link to="/admin/forgot-password" className="btn btn-primary btn-md btn-block">Request a new link</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 8 characters with letters and numbers.">
      <form className="form" onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="New password" required>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        <Field label="Confirm new password" required>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" block loading={busy} icon={<KeyRound size={16} />}>Update password</Button>
      </form>
    </AuthShell>
  );
}
