import { ShieldCheck } from 'lucide-react';
import { createElement, lazy } from 'react';
import { MODULES } from '@/constants/permissions';

const QualitySafetyWorkspacePage = lazy(() => import('./pages/QualitySafetyWorkspacePage'));
const InspectionsTab = () => createElement(QualitySafetyWorkspacePage, { initialTab: 'inspections' });
const SafetyTab = () => createElement(QualitySafetyWorkspacePage, { initialTab: 'safety' });

export default {
  key: MODULES.QUALITY_SAFETY,
  title: 'Quality & Safety',
  path: '/quality-safety',
  icon: ShieldCheck,
  permission: MODULES.QUALITY_SAFETY,
  group: 'assets',
  phase: 6,
  description: 'Run quality checklists, NCR punch lists, safety incidents, and toolbox talks.',
  element: InspectionsTab,
  sections: [
    { path: '', title: 'Inspections & NCR', element: InspectionsTab },
    { path: 'safety', title: 'Safety incidents', element: SafetyTab },
  ],
  capabilities: [
    'Site quality inspection checklists with pass/fail scoring',
    'Non-conformance (NCR) & snag register gating project closure',
    'Incident, near-miss and toolbox talk safety register',
  ],
};
