import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { CreatePush } from "./pages/CreatePush";
import { ViewPush } from "./pages/ViewPush";
import { PreviewPush } from "./pages/PreviewPush";
import { AuditLog } from "./pages/AuditLog";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";
import { Admin } from "./pages/Admin";
import { NotFound } from "./pages/NotFound";
import { useAuth } from "./hooks/useAuth";

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="create" element={<CreatePush />} />
        <Route path="p/:id" element={<ViewPush />} />
        <Route path="v/:id" element={<PreviewPush />} />
        <Route path="s/:id" element={<ViewPush secure />} />
        <Route path="audit" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}