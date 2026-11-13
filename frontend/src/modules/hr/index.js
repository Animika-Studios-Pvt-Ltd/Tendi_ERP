import { Users } from 'lucide-react';
import { createElement, lazy } from 'react';
import { MODULES } from '@/constants/permissions';

const HrWorkspacePage = lazy(() => import('./pages/HrWorkspacePage'));

const EmployeesTab = () => createElement(HrWorkspacePage, { initialTab: 'employees' });
const AttendanceTab = () => createElement(HrWorkspacePage, { initialTab: 'attendance' });
const LeaveTab = () => createElement(HrWorkspacePage, { initialTab: 'leave' });
const PayrollTab = () => createElement(HrWorkspacePage, { initialTab: 'payroll' });

export default {
  key: MODULES.HR,
  title: 'HR & Labour',
  path: '/hr',
  icon: Users,
  permission: MODULES.HR,
  group: 'commercial',
  phase: 5,
  description: 'Company employees, daily wage labour, contractor workers, site attendance, leaves and payroll runs.',
  element: EmployeesTab,
  sections: [
    { path: '', title: 'Employees', element: EmployeesTab },
    { path: 'attendance', title: 'Attendance', element: AttendanceTab },
    { path: 'leave', title: 'Leave', element: LeaveTab },
    { path: 'payroll', title: 'Payroll', element: PayrollTab },
  ],
  capabilities: [
    'Four worker categories: company employee, daily wage, contractor labour, outsourced',
    'Project/site daily attendance and overtime tracking',
    'Leave workflow and attendance-driven wage/PF/ESIC payroll calculation',
  ],
};
