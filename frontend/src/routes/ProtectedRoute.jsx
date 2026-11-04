import { Navigate, Outlet, useLocation } from 'react-router-dom';
import AccessDenied from '@/components/common/AccessDenied';
import PageLoader from '@/components/common/PageLoader';
import { useAuth } from '@/hooks/useAuth';

/** Requires a signed-in session; otherwise redirects to /login and returns afterwards. */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <PageLoader label="Checking your session" />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <Outlet />;
}

/** Requires a module permission. The API enforces the same rule; this keeps the UI honest. */
export function PermissionGate({ module, action = 'read', title, children }) {
  const { can } = useAuth();
  if (!can(module, action)) return <AccessDenied moduleTitle={title} />;
  return children;
}
