import { ChartColumn } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.REPORTS,
  title: 'Reports & Analytics',
  path: '/reports',
  icon: ChartColumn,
  permission: MODULES.REPORTS,
  group: 'insight',
  phase: 7,
  description: 'A dedicated reporting workspace for cross-module analysis and exports.',
  sections: [
    { path: '', title: 'Report library' },
    { path: 'project-cost', title: 'Project cost' },
    { path: 'procurement', title: 'Procurement' },
    { path: 'labour', title: 'Labour & attendance' },
  ],
  capabilities: [
    'Project cost and budget variance reports',
    'Procurement cycle time and vendor performance',
    'Labour productivity and attendance',
    'Excel and PDF export with saved filters',
  ],
};
