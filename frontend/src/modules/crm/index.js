import { HeartHandshake } from 'lucide-react';
import { createElement, lazy } from 'react';
import { MODULES } from '@/constants/permissions';

const CrmWorkspacePage = lazy(() => import('./pages/CrmWorkspacePage'));
const CustomersTab = () => createElement(CrmWorkspacePage, { initialTab: 'customers' });
const EnquiriesTab = () => createElement(CrmWorkspacePage, { initialTab: 'enquiries' });

export default {
  key: MODULES.CRM,
  title: 'CRM & Clients',
  path: '/crm',
  icon: HeartHandshake,
  permission: MODULES.CRM,
  group: 'commercial',
  phase: 6,
  description: 'Client directory, sales enquiries, complaints, handover and warranty tracking.',
  element: CustomersTab,
  sections: [
    { path: '', title: 'Customers', element: CustomersTab },
    { path: 'enquiries', title: 'Enquiries', element: EnquiriesTab },
  ],
  capabilities: [
    'Client master directory and enquiry pipeline',
    'Portal-scoped complaints, handover certificates and defect-liability warranty tracking',
  ],
};
