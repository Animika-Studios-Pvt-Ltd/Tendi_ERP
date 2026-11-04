import { Contact } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.CRM,
  title: 'CRM & Customers',
  path: '/crm',
  icon: Contact,
  permission: MODULES.CRM,
  group: 'commercial',
  phase: 6,
  description: 'Track enquiries through to customers and give customers visibility of their projects.',
  sections: [
    { path: '', title: 'Customers' },
    { path: 'enquiries', title: 'Enquiries' },
  ],
  capabilities: [
    'Enquiry pipeline with follow-ups',
    'Customer accounts linked to projects',
    'Customer portal access for progress and documents',
  ],
};
