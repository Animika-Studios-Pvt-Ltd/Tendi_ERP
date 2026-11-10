import { ShoppingCart } from 'lucide-react';
import { lazy } from 'react';
import { MODULES } from '@/constants/permissions';

const MaterialRequestsPage = lazy(() => import('./pages/MaterialRequestsPage'));
const VendorsListPage = lazy(() => import('./pages/VendorsListPage'));
const PurchaseOrdersPage = lazy(() => import('./pages/PurchaseOrdersPage'));
const GoodsReceiptsPage = lazy(() => import('./pages/GoodsReceiptsPage'));

export default {
  key: MODULES.PROCUREMENT,
  title: 'Procurement',
  path: '/procurement',
  icon: ShoppingCart,
  permission: MODULES.PROCUREMENT,
  group: 'supply',
  phase: 3,
  description: 'Run material requests through approval, quotations, purchase orders and goods receipt.',
  element: MaterialRequestsPage,
  sections: [
    { path: '', title: 'Material requests', element: MaterialRequestsPage },
    { path: 'vendors', title: 'Vendors', element: VendorsListPage },
    { path: 'purchase-orders', title: 'Purchase orders', element: PurchaseOrdersPage },
    { path: 'goods-receipts', title: 'Goods receipts', element: GoodsReceiptsPage },
  ],
  capabilities: [
    'Material requests raised from site with required-by dates',
    'Vendor register and quotation comparison',
    'Purchase orders with approval limits',
    'Goods receipt that updates inventory automatically',
  ],
  workflow: {
    title: 'Material procurement',
    steps: ['Material request', 'Manager approval', 'Vendor quotation', 'Purchase order', 'Goods receipt', 'Inventory update'],
  },
};
