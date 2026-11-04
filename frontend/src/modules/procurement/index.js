import { ShoppingCart } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.PROCUREMENT,
  title: 'Procurement',
  path: '/procurement',
  icon: ShoppingCart,
  permission: MODULES.PROCUREMENT,
  group: 'supply',
  phase: 3,
  description: 'Run material requests through approval, quotations, purchase orders and goods receipt.',
  sections: [
    { path: '', title: 'Material requests' },
    { path: 'vendors', title: 'Vendors' },
    { path: 'purchase-orders', title: 'Purchase orders' },
    { path: 'goods-receipts', title: 'Goods receipts' },
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
