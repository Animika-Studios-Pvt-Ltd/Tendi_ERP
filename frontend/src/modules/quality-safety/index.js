import { ShieldCheck } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.QUALITY_SAFETY,
  title: 'Quality & Safety',
  path: '/quality-safety',
  icon: ShieldCheck,
  permission: MODULES.QUALITY_SAFETY,
  group: 'assets',
  phase: 6,
  description: 'Run quality inspections and record, investigate and close safety incidents.',
  sections: [
    { path: '', title: 'Inspections' },
    { path: 'incidents', title: 'Safety incidents' },
  ],
  capabilities: [
    'Inspection checklists per activity and stage',
    'Non-conformance tracking with corrective actions',
    'Incident reports with severity, root cause and closure',
  ],
};
