import { Forklift } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.EQUIPMENT,
  title: 'Equipment Management',
  path: '/equipment',
  icon: Forklift,
  permission: MODULES.EQUIPMENT,
  group: 'assets',
  phase: 6,
  description: 'Keep a register of plant and machinery, where it is deployed, and its maintenance history.',
  sections: [
    { path: '', title: 'Equipment register' },
    { path: 'maintenance', title: 'Maintenance' },
  ],
  capabilities: [
    'Owned and hired equipment register',
    'Site deployment and utilisation log',
    'Preventive and breakdown maintenance records',
  ],
};
