import { LayoutDashboard } from 'lucide-react';
import { lazy } from 'react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.DASHBOARD,
  title: 'Dashboard',
  path: '/dashboard',
  icon: LayoutDashboard,
  permission: MODULES.DASHBOARD,
  group: 'overview',
  phase: 1,
  description: 'Portfolio overview of schedule, cost, approvals, stock and site activity.',
  element: lazy(() => import('./pages/DashboardPage')),
  capabilities: [
    'Live KPIs aggregated from each module',
    'Role-specific widgets (site, project, finance views)',
    'Drill-down into projects, approvals and stock alerts',
  ],
};
