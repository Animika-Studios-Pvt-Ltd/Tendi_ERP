import { HardHat } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.SITES,
  title: 'Site Management',
  path: '/sites',
  icon: HardHat,
  permission: MODULES.SITES,
  group: 'execution',
  phase: 2,
  description: 'Manage sites and capture daily progress, labour, material use, photos and issues from the field.',
  sections: [
    { path: '', title: 'Sites' },
    { path: 'daily-progress', title: 'Daily progress reports' },
  ],
  capabilities: [
    'Site register linked to projects',
    'Mobile-friendly daily progress reports with photos',
    'Labour and material consumption per report',
    'Issue log with owners and resolution status',
  ],
  workflow: {
    title: 'Daily site progress',
    steps: [
      'Site engineer starts the daily report',
      'Labour and material usage recorded',
      'Photos and issues attached',
      'Project manager approves',
      'Dashboard and project progress update',
    ],
  },
};
