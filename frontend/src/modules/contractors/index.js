import { Handshake } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.CONTRACTORS,
  title: 'Contractor Management',
  path: '/contractors',
  icon: Handshake,
  permission: MODULES.CONTRACTORS,
  group: 'commercial',
  phase: 5,
  description: 'Manage subcontractors, contracts and work orders, and verify measurement-based bills.',
  sections: [
    { path: '', title: 'Contractors' },
    { path: 'contracts', title: 'Contracts' },
    { path: 'work-orders', title: 'Work orders' },
    { path: 'bills', title: 'Contractor bills' },
  ],
  capabilities: [
    'Contractor register with compliance documents',
    'Contracts and rate schedules',
    'Work orders with measurement sheets',
    'Running bills with retention and payment tracking',
  ],
  workflow: {
    title: 'Contractor billing',
    steps: ['Work order', 'Measurement details', 'Bill submission', 'Verification', 'Approval', 'Payment tracking'],
  },
};
