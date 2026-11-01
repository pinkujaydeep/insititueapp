import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import {
  BarChart3, BookOpen, ClipboardList, ExternalLink, IndianRupee, LayoutDashboard, LogOut, Menu, ScrollText, Settings,
  ShieldCheck, Users, X,
} from "lucide-react";
import { RoleBadge } from "../../components/ui/Badge";
import { useAuth } from "../../hooks/useAuth";
import { useSettings } from "../../hooks/useSettings";
import type { Permission } from "../../lib/types";

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; permission?: Permission; end?: boolean }[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/students", label: "Students & Admissions", icon: ClipboardList, permission: "students.read" },
  { to: "/admin/payments", label: "Fee Collection", icon: IndianRupee, permission: "fees.read" },
  { to: "/admin/reports", label: "Reports", icon: BarChart3, permission: "reports.view" },
  { to: "/admin/courses", label: "Courses", icon: BookOpen, permission: "courses.manage" },
  { to: "/admin/users", label: "Users & Roles", icon: Users, permission: "users.manage" },
  { to: "/admin/audit", label: "Audit Log", icon: ScrollText, permission: "audit.read" },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout() {
  const { profile, can, signOut } = useAuth();
  const { settings, logoUrl } = useSettings();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="admin-shell">
      <a href="#admin-main" className="skip-link">Skip to content</a>
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="Admin navigation">
        <div className="sidebar-brand">
          {logoUrl ? <img src={logoUrl} alt="" className="brand-logo" /> : <span className="brand-mark" aria-hidden>{settings?.institute_name?.charAt(0) ?? "I"}</span>}
          <span>{settings?.institute_name}</span>
          <button type="button" className="icon-btn sidebar-close" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {NAV.filter((n) => !n.permission || can(n.permission)).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={18} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
          <a href="/" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={18} aria-hidden />
            <span>View website</span>
          </a>
        </nav>
        <div className="sidebar-user">
          <div className="avatar" aria-hidden>{profile?.full_name.charAt(0)}</div>
          <div className="sidebar-user-info">
            <strong>{profile?.full_name}</strong>
            <span>{profile?.email}</span>
            <div className="role-list">{profile?.roles.map((r) => <RoleBadge key={r} role={r} />)}</div>
          </div>
          <button type="button" className="icon-btn" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} aria-hidden />}

      <div className="admin-main-wrap">
        <header className="admin-topbar">
          <button type="button" className="icon-btn menu-toggle" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu size={22} />
          </button>
          <span className="topbar-title"><ShieldCheck size={16} aria-hidden /> Admin portal</span>
        </header>
        <main id="admin-main" className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
