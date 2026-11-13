import { FileText } from 'lucide-react';
import { lazy } from 'react';
import { MODULES } from '@/constants/permissions';

const DocumentsWorkspacePage = lazy(() => import('./pages/DocumentsWorkspacePage'));

export default {
  key: MODULES.DOCUMENTS,
  title: 'Document Management',
  path: '/documents',
  icon: FileText,
  permission: MODULES.DOCUMENTS,
  group: 'assets',
  phase: 4,
  description: 'Store drawings, contracts, approvals, RFIs, submittals, transmittals and site photos against projects.',
  element: DocumentsWorkspacePage,
  sections: [{ path: '', title: 'Documents & Drawings', element: DocumentsWorkspacePage }],
  capabilities: [
    'Project-scoped folders with version history & signed download URLs',
    'Drawing register with revision approval and obsolete superseding',
    'RFIs, technical submittals, and formal transmittals',
  ],
};
