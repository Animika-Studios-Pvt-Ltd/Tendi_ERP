import { Boxes } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.INVENTORY,
  title: 'Inventory Management',
  path: '/inventory',
  icon: Boxes,
  permission: MODULES.INVENTORY,
  group: 'supply',
  phase: 3,
  description: 'Track material stock by site and store, with every movement recorded as a transaction.',
  sections: [
    { path: '', title: 'Stock overview' },
    { path: 'materials', title: 'Material master' },
    { path: 'transactions', title: 'Stock movements' },
  ],
  capabilities: [
    'Material master with units, categories and reorder levels',
    'Stock by store and site, derived from transactions',
    'Issues, returns and inter-site transfers',
    'Low-stock alerts feeding procurement',
  ],
};
