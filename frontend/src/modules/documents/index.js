import { FileText } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.DOCUMENTS,
  title: 'Document Management',
  path: '/documents',
  icon: FileText,
  permission: MODULES.DOCUMENTS,
  group: 'assets',
  phase: 4,
  description: 'Store drawings, contracts, approvals and site photos against the project they belong to.',
  capabilities: [
    'Project-scoped folders with version history',
    'Drawing register with revision control',
    'Access controlled by project assignment and role',
  ],
};
