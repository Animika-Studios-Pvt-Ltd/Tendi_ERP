import { Briefcase } from 'lucide-react';
import { createElement, lazy } from 'react';
import { MODULES } from '@/constants/permissions';

const ContractorsWorkspacePage = lazy(() => import('./pages/ContractorsWorkspacePage'));

const ContractorsTab = () => createElement(ContractorsWorkspacePage, { initialTab: 'contractors' });
const WorkOrdersTab = () => createElement(ContractorsWorkspacePage, { initialTab: 'work-orders' });
const MeasurementsTab = () => createElement(ContractorsWorkspacePage, { initialTab: 'measurements' });
const BillsTab = () => createElement(ContractorsWorkspacePage, { initialTab: 'bills' });

export default {
  key: MODULES.CONTRACTORS,
  title: 'Contractor Management',
  path: '/contractors',
  icon: Briefcase,
  permission: MODULES.CONTRACTORS,
  group: 'commercial',
  phase: 5,
  description: 'Subcontractor register, work orders, measurement books, and cumulative RA bill certification.',
  element: ContractorsTab,
  sections: [
    { path: '', title: 'Contractors', element: ContractorsTab },
    { path: 'work-orders', title: 'Work orders', element: WorkOrdersTab },
    { path: 'measurements', title: 'Measurement book', element: MeasurementsTab },
    { path: 'bills', title: 'Contractor bills', element: BillsTab },
  ],
  capabilities: [
    'Contractor master & package work orders with retention and advance tracking',
    'L×B×D measurement book entries and automated RA bill certification',
    'Automatic payable invoice generation into Finance upon RA bill approval',
  ],
};
