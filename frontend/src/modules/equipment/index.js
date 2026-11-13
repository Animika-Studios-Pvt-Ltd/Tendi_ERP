import { Wrench } from 'lucide-react';
import { createElement, lazy } from 'react';
import { MODULES } from '@/constants/permissions';

const EquipmentWorkspacePage = lazy(() => import('./pages/EquipmentWorkspacePage'));
const RegisterTab = () => createElement(EquipmentWorkspacePage, { initialTab: 'register' });
const MaintenanceTab = () => createElement(EquipmentWorkspacePage, { initialTab: 'maintenance' });

export default {
  key: MODULES.EQUIPMENT,
  title: 'Equipment & Maintenance',
  path: '/equipment',
  icon: Wrench,
  permission: MODULES.EQUIPMENT,
  group: 'assets',
  phase: 6,
  description: 'Track owned and hired machinery, site deployments, fuel and maintenance.',
  element: RegisterTab,
  sections: [
    { path: '', title: 'Equipment register', element: RegisterTab },
    { path: 'maintenance', title: 'Maintenance', element: MaintenanceTab },
  ],
  capabilities: [
    'Equipment master for owned, rented and leased machinery',
    'Usage, fuel, breakdown and preventive maintenance logging',
  ],
};
