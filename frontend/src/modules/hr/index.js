import { Users } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.HR,
  title: 'HR & Labour',
  path: '/hr',
  icon: Users,
  permission: MODULES.HR,
  group: 'commercial',
  phase: 5,
  description: 'Manage staff and site labour, daily attendance and leave.',
  sections: [
    { path: '', title: 'Employees' },
    { path: 'attendance', title: 'Attendance' },
    { path: 'leave', title: 'Leave' },
  ],
  capabilities: [
    'Employee and labour register with skills and wage rates',
    'Site-wise daily attendance',
    'Leave requests with approval',
    'Labour cost feed into project costing',
  ],
};
