import { Scale } from 'lucide-react';
import { lazy } from 'react';
import { MODULES } from '@/constants/permissions';

const LegalWorkspacePage = lazy(() => import('./pages/LegalWorkspacePage'));

export default {
  key: MODULES.LEGAL,
  title: 'Legal & Compliance',
  path: '/legal',
  icon: Scale,
  permission: MODULES.LEGAL,
  group: 'assets',
  phase: 6,
  description: 'Contracts lifecycle, regulatory permits, insurance policies, and expiry alerts.',
  element: LegalWorkspacePage,
  sections: [{ path: '', title: 'Permits & contracts', element: LegalWorkspacePage }],
  capabilities: [
    'Unified client/vendor/contractor contracts & amendments register',
    'Permits, licences & insurance policies with 30-day expiry alerts',
    'Legal notices, claims & disputes tracker',
  ],
};

