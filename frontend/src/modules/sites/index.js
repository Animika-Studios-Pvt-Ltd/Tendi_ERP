import { HardHat } from 'lucide-react';
import { lazy } from 'react';
import { ACTIONS, MODULES } from '@/constants/permissions';

const SitesListPage = lazy(() => import('./pages/SitesListPage'));
const SiteFormPage = lazy(() => import('./pages/SiteFormPage'));
const SiteDetailPage = lazy(() => import('./pages/SiteDetailPage'));
const DprListPage = lazy(() => import('./pages/DprListPage'));
const DprFormPage = lazy(() => import('./pages/DprFormPage'));
const DprDetailPage = lazy(() => import('./pages/DprDetailPage'));
const SiteInstructionsPage = lazy(() => import('./pages/SiteInstructionsPage'));

export default {
  key: MODULES.SITES,
  title: 'Site Management',
  path: '/sites',
  icon: HardHat,
  permission: MODULES.SITES,
  group: 'execution',
  phase: 2,
  description: 'Manage sites and capture daily progress, labour, material use, photos and issues from the field.',
  element: SitesListPage,
  sections: [
    { path: '', title: 'Sites', element: SitesListPage },
    { path: 'daily-progress', title: 'Daily progress reports', element: DprListPage },
    { path: 'instructions', title: 'Site instructions', element: SiteInstructionsPage },
  ],
  routes: [
    { path: 'new', title: 'New site', element: SiteFormPage, action: ACTIONS.CREATE },
    { path: ':id', element: SiteDetailPage },
    { path: ':id/edit', title: 'Edit site', element: SiteFormPage, action: ACTIONS.UPDATE },
    { path: 'daily-progress/new', title: 'Draft DPR', element: DprFormPage, action: ACTIONS.CREATE },
    { path: 'daily-progress/:id', element: DprDetailPage },
    { path: 'daily-progress/:id/edit', title: 'Edit DPR', element: DprFormPage, action: ACTIONS.UPDATE },
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
