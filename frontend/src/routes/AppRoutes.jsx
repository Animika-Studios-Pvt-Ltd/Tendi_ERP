import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ModuleWorkspace from '@/components/common/ModuleWorkspace';
import AppLayout from '@/layouts/AppLayout';
import AuthLayout from '@/layouts/AuthLayout';
import { MODULE_REGISTRY } from '@/modules/registry';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import LoginPage from '@/pages/auth/LoginPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { PermissionGate, ProtectedRoute } from './ProtectedRoute';

const ProfilePage = lazy(() => import('@/pages/ProfilePage'));

function moduleRoutes(module) {
  const gate = (element, action = 'read') => (
    <PermissionGate module={module.permission} action={action} title={module.title}>
      {element}
    </PermissionGate>
  );
  const ModulePage = module.element;
  const rootSection = module.sections?.find((s) => !s.path);

  return (
    <Route key={module.key} path={module.path.slice(1)}>
      <Route index element={gate(ModulePage ? <ModulePage /> : <ModuleWorkspace module={module} section={rootSection} />)} />
      {(module.sections ?? [])
        .filter((section) => section.path)
        .map((section) => {
          const SectionPage = section.element;
          return (
            <Route
              key={section.path}
              path={section.path}
              element={gate(SectionPage ? <SectionPage /> : <ModuleWorkspace module={module} section={section} />)}
            />
          );
        })}
      {(module.routes ?? []).map(({ path, element: Page, action }) => (
        <Route key={path} path={path} element={gate(<Page />, action)} />
      ))}
    </Route>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          {MODULE_REGISTRY.map(moduleRoutes)}
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
