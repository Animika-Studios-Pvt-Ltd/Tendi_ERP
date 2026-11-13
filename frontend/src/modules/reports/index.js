import { BarChart3 } from 'lucide-react';
import { lazy } from 'react';
import { MODULES } from '@/constants/permissions';

const ReportsPage = lazy(() => import('./pages/ReportsPage'));

export default {
  key: MODULES.REPORTS,
  title: 'Reports & Insights',
  path: '/reports',
  icon: BarChart3,
  permission: MODULES.REPORTS,
  group: 'insight',
  phase: 7,
  description: 'Cross-module analytics, financial variance, inventory valuation, and compliance CSV exports.',
  element: ReportsPage,
  sections: [{ path: '', title: 'Report library', element: ReportsPage }],
  capabilities: [
    'Project, financial, procurement, inventory, HR, contractor, equipment, safety, client and legal reports',
    'Dynamic project-scope filtering and per-module permission enforcement',
    'CSV formula-safe export and print views',
  ],
};
