import { Calculator } from 'lucide-react';
import { lazy } from 'react';
import { MODULES } from '@/constants/permissions';

const EstimatesListPage = lazy(() => import('./pages/EstimatesListPage'));
const EstimateDetailPage = lazy(() => import('./pages/EstimateDetailPage'));
const RateAnalysisPage = lazy(() => import('./pages/RateAnalysisPage'));
const TendersPage = lazy(() => import('./pages/TendersPage'));

export default {
  key: MODULES.ESTIMATION,
  title: 'Preconstruction & Estimation',
  path: '/estimation',
  icon: Calculator,
  permission: MODULES.ESTIMATION,
  group: 'commercial',
  phase: 2,
  description: 'Manage enquiry cost estimates, BOQ takeoffs, composite rate analyses, tenders, and project baseline conversion.',
  element: EstimatesListPage,
  sections: [
    { path: '', title: 'Estimates & BOQ' },
    { path: 'rate-analyses', title: 'Rate Analysis Library', element: RateAnalysisPage },
    { path: 'tenders', title: 'Tenders & Bids', element: TendersPage },
  ],
  routes: [{ path: ':id', element: EstimateDetailPage }],
  capabilities: [
    'L×B×H quantity takeoff and BOQ builder mapped to Cost Heads and WBS packages',
    'Master Rate Analysis library pulling live Material standard rates',
    'Versioned Estimate revisions, approval workflow, and one-click Project & Baseline conversion',
    'Tender bid collection, L1 comparison matrix, and contract award tracking',
  ],
};

