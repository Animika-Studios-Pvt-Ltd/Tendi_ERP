import { Settings } from 'lucide-react';
import { lazy } from 'react';
import { MODULES } from '@/constants/permissions';

const SettingsPage = lazy(() => import('./pages/SettingsPage'));

export default {
  key: MODULES.SETTINGS,
  title: 'Settings',
  path: '/settings',
  icon: Settings,
  permission: MODULES.SETTINGS,
  group: 'admin',
  phase: 2,
  description: 'Company profile, numbering series, approval limits and master data.',
  element: SettingsPage,
  capabilities: [
    'Company profile and branding',
    'Document numbering series (PO, MR, GRN, invoices)',
    'Approval limits by role and amount',
    'Units, cost heads and material categories',
  ],
};
