import { Settings } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.SETTINGS,
  title: 'Settings',
  path: '/settings',
  icon: Settings,
  permission: MODULES.SETTINGS,
  group: 'admin',
  phase: 2,
  description: 'Company profile, numbering series, approval limits and master data.',
  capabilities: [
    'Company profile and branding',
    'Document numbering series (PO, MR, GRN, invoices)',
    'Approval limits by role and amount',
    'Units, cost heads and material categories',
  ],
};
