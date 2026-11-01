import { useState, type FormEvent } from "react";
import { KeyRound, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { Badge, RoleBadge } from "../../components/ui/Badge";
import { Button, IconButton } from "../../components/ui/Button";
import { Alert, ErrorState, SkeletonRows } from "../../components/ui/Feedback";
import { useConfirm, useToast } from "../../components/ui/FeedbackProvider";
import { Field } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/Layout";
import { Modal } from "../../components/ui/Modal";
import { useAuth } from "../../hooks/useAuth";
import { useQuery } from "../../hooks/useQuery";
import { toAppError, unwrap } from "../../lib/errors";
import { formatDate, ROLE_LABELS, ROLES, type AppRole } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { AdminUserRow } from "../../lib/types";
import { validateNewPassword } from "./AuthPages";

type Staff = AdminUserRow & { user_roles: { role: AppRole }[] };

const ROLE_HELP: Record<AppRole, string> = {
  super_admin: "Full access, including users, roles, settings, refunds and voids",
  administrator: "Courses, students, fee configuration, view payments and reports",
  accounts_staff: "Record payments, receipts and financial reports",
  admissions_staff: "Applications, admission status and student contact",
};

async function callAdminUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const payload = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(payload?.error ?? error.message);
  }
  return data;
}

export default function UsersPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ type: "create" } | { type: "roles" | "password"; user: Staff } | null>(null);
  const users = useQuery(
    async () => (await unwrap(supabase.from("admin_users").select("*, user_roles!user_roles_user_id_fkey(role)").order("full_name"))) as unknown as Staff[],
    [],
  );

  const setActive = async (u: Staff, active: boolean) => {
    if (!active && !(await confirm({ title: "Deactivate account?", message: `${u.full_name} will be signed out and lose access immediately.`, tone: "danger", confirmLabel: "Deactivate" }))) return;
    try {
      await callAdminUsers({ action: "set_active", user_id: u.id, is_active: active });
      toast(active ? "Account activated" : "Account deactivated");
      users.reload();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Staff accounts are created here. Public sign-up is disabled."
        actions={<Button icon={<Plus size={16} />} onClick={() => setModal({ type: "create" })}>Add staff member</Button>}
      />
      {users.error && <ErrorState message={users.error.message} onRetry={users.reload} />}
      <div className="card table-card">
        {users.loading && !users.data ? <SkeletonRows rows={4} cols={4} /> : (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead><tr><th>Name</th><th>Roles</th><th>Status</th><th>Added</th><th /></tr></thead>
              <tbody>
                {users.data?.map((u) => {
                  const self = u.id === profile?.id;
                  return (
                    <tr key={u.id} className={u.is_active ? "" : "voided"}>
                      <td data-label="Name"><strong>{u.full_name}</strong>{self && <Badge tone="info">You</Badge>}<div className="muted small">{u.email}</div></td>
                      <td data-label="Roles"><div className="role-list">{u.user_roles.map((r) => <RoleBadge key={r.role} role={r.role} />)}{u.user_roles.length === 0 && <span className="muted small">No roles</span>}</div></td>
                      <td data-label="Status">{u.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Deactivated</Badge>}</td>
                      <td data-label="Added">{formatDate(u.created_at)}</td>
                      <td className="actions">
                        {!self && (
                          <>
                            <IconButton label={`Edit roles for ${u.full_name}`} onClick={() => setModal({ type: "roles", user: u })}><ShieldCheck size={16} /></IconButton>
                            <IconButton label={`Set password for ${u.full_name}`} onClick={() => setModal({ type: "password", user: u })}><KeyRound size={16} /></IconButton>
                            {u.is_active
                              ? <IconButton label={`Deactivate ${u.full_name}`} onClick={() => void setActive(u, false)}><UserX size={16} /></IconButton>
                              : <IconButton label={`Activate ${u.full_name}`} onClick={() => void setActive(u, true)}><UserCheck size={16} /></IconButton>}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="muted small">You cannot change your own roles or deactivate yourself. Another Super Admin must do it.</p>

      {modal?.type === "create" && <CreateStaffModal onClose={() => setModal(null)} onSaved={users.reload} />}
      {modal?.type === "roles" && <RolesModal user={modal.user} onClose={() => setModal(null)} onSaved={users.reload} />}
      {modal?.type === "password" && <PasswordModal user={modal.user} onClose={() => setModal(null)} />}
    </>
  );
}

function RoleCheckboxes({ value, onChange }: { value: AppRole[]; onChange: (roles: AppRole[]) => void }) {
  return (
    <fieldset className="role-options">
      <legend>Roles</legend>
      {ROLES.map((r) => (
        <label key={r} className="role-option">
          <input type="checkbox" checked={value.includes(r)} onChange={(e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))} />
          <span><strong>{ROLE_LABELS[r]}</strong><small className="muted">{ROLE_HELP[r]}</small></span>
        </label>
      ))}
    </fieldset>
  );
}

function CreateStaffModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "", confirm: "" });
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem =
      form.full_name.trim().length < 2 ? "Enter the full name" :
      !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(form.email.trim()) ? "Enter a valid email" :
      roles.length === 0 ? "Select at least one role" :
      validateNewPassword(form.password, form.confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await callAdminUsers({ action: "create", full_name: form.full_name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined, password: form.password, roles });
      toast("Staff account created. Share the temporary password securely.");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add staff member" onClose={onClose} size="lg">
      <form className="form" onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="grid-3">
          <Field label="Full name" required><input value={form.full_name} maxLength={100} onChange={set("full_name")} /></Field>
          <Field label="Email" required><input type="email" value={form.email} maxLength={200} onChange={set("email")} /></Field>
          <Field label="Phone"><input type="tel" value={form.phone} maxLength={30} onChange={set("phone")} /></Field>
          <Field label="Temporary password" required hint="8+ characters, letters and numbers"><input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} /></Field>
          <Field label="Confirm password" required><input type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} /></Field>
        </div>
        <RoleCheckboxes value={roles} onChange={setRoles} />
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Create account</Button>
        </div>
      </form>
    </Modal>
  );
}

function RolesModal({ user, onClose, onSaved }: { user: Staff; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const current = user.user_roles.map((r) => r.role);
  const [roles, setRoles] = useState<AppRole[]>(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const add = roles.filter((r) => !current.includes(r));
      const remove = current.filter((r) => !roles.includes(r));
      if (add.length) await unwrap(supabase.from("user_roles").insert(add.map((role) => ({ user_id: user.id, role, granted_by: profile!.id }))).select());
      if (remove.length) await unwrap(supabase.from("user_roles").delete().eq("user_id", user.id).in("role", remove).select());
      toast("Roles updated");
      onSaved();
      onClose();
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Roles · ${user.full_name}`}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save roles</Button></>}
    >
      {error && <Alert>{error}</Alert>}
      {roles.length === 0 && <Alert tone="warning">Without roles this user cannot access the admin portal.</Alert>}
      <RoleCheckboxes value={roles} onChange={setRoles} />
    </Modal>
  );
}

function PasswordModal({ user, onClose }: { user: Staff; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateNewPassword(password, confirmPw);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await callAdminUsers({ action: "set_password", user_id: user.id, password });
      toast("Temporary password set");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Set password · ${user.full_name}`} onClose={onClose} size="sm">
      <form className="form" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <Field label="New temporary password" required><input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Confirm" required><input type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} /></Field>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Set password</Button>
        </div>
      </form>
    </Modal>
  );
}
