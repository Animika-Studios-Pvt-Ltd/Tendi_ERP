import { UserCog } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.USERS,
  title: 'User Management',
  path: '/users',
  icon: UserCog,
  permission: MODULES.USERS,
  group: 'admin',
  phase: 2,
  description: 'Invite users, assign roles and projects, and review the audit trail.',
  sections: [
    { path: '', title: 'Users' },
    { path: 'roles', title: 'Roles & permissions' },
    { path: 'audit-log', title: 'Audit log' },
  ],
  capabilities: [
    'User directory with status and last sign-in',
    'Role permission matrix (create, read, update, delete, approve, reject)',
    'Project assignment for record-level access',
    'Audit log of sign-ins and sensitive changes',
  ],
};
