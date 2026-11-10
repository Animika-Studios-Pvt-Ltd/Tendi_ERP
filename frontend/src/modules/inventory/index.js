import { Boxes } from 'lucide-react';
import { lazy } from 'react';
import { MODULES } from '@/constants/permissions';

const StockOverviewPage = lazy(() => import('./pages/StockOverviewPage'));
const MaterialsListPage = lazy(() => import('./pages/MaterialsListPage'));
const TransactionsListPage = lazy(() => import('./pages/TransactionsListPage'));

export default {
  key: MODULES.INVENTORY,
  title: 'Inventory Management',
  path: '/inventory',
  icon: Boxes,
  permission: MODULES.INVENTORY,
  group: 'supply',
  phase: 3,
  description: 'Track material stock by site and store, with every movement recorded as a transaction.',
  element: StockOverviewPage,
  sections: [
    { path: '', title: 'Stock overview', element: StockOverviewPage },
    { path: 'materials', title: 'Material master', element: MaterialsListPage },
    { path: 'transactions', title: 'Stock movements', element: TransactionsListPage },
  ],
  capabilities: [
    'Material master with units, categories and reorder levels',
    'Stock by store and site, derived from transactions',
    'Issues, returns and inter-site transfers',
    'Low-stock alerts feeding procurement',
  ],
};
