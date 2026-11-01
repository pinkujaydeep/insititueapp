import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { PageLoader } from "./components/ui/Feedback";
import { RequireStaff } from "./hooks/useAuth";
import { isSupabaseConfigured } from "./lib/supabase";
import HomePage from "./pages/HomePage";

// Admin code is split out so the public website loads quickly.
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const DashboardPage = lazy(() => import("./pages/admin/DashboardPage"));
const StudentsPage = lazy(() => import("./pages/admin/StudentsPage"));
const StudentProfilePage = lazy(() => import("./pages/admin/StudentProfilePage"));
const PaymentsPage = lazy(() => import("./pages/admin/PaymentsPage"));
const ReportsPage = lazy(() => import("./pages/admin/ReportsPage"));
const ReceiptPage = lazy(() => import("./pages/admin/ReceiptPage"));
const CoursesPage = lazy(() => import("./pages/admin/CoursesPage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const AuditLogPage = lazy(() => import("./pages/admin/AuditLogPage"));
const LoginPage = lazy(() => import("./pages/admin/AuthPages").then((m) => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() => import("./pages/admin/AuthPages").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/admin/AuthPages").then((m) => ({ default: m.ResetPasswordPage })));

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="center-page">
        <div className="card narrow-card">
          <h1>Configuration required</h1>
          <p>
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>client/.env.example</code>) and
            restart the app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/admin/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/admin"
          element={
            <RequireStaff>
              <AdminLayout />
            </RequireStaff>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="students" element={<RequireStaff permission="students.read"><StudentsPage /></RequireStaff>} />
          <Route path="students/:id" element={<RequireStaff permission="students.read"><StudentProfilePage /></RequireStaff>} />
          <Route path="payments" element={<RequireStaff permission="fees.read"><PaymentsPage /></RequireStaff>} />
          <Route path="receipts/:id" element={<RequireStaff permission="fees.read"><ReceiptPage /></RequireStaff>} />
          <Route path="reports" element={<RequireStaff permission="reports.view"><ReportsPage /></RequireStaff>} />
          <Route path="courses" element={<RequireStaff permission="courses.manage"><CoursesPage /></RequireStaff>} />
          <Route path="users" element={<RequireStaff permission="users.manage"><UsersPage /></RequireStaff>} />
          <Route path="audit" element={<RequireStaff permission="audit.read"><AuditLogPage /></RequireStaff>} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
