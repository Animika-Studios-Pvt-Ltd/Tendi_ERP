import { UserCog } from 'lucide-react';
import { lazy } from 'react';
import { ACTIONS, MODULES } from '@/constants/permissions';

const UsersListPage = lazy(() => import('./pages/UsersListPage'));
const UserFormPage = lazy(() => import('./pages/UserFormPage'));
const UserDetailPage = lazy(() => import('./pages/UserDetailPage'));
const RolesListPage = lazy(() => import('./pages/RolesListPage'));

export default {
  key: MODULES.USERS,
  title: 'User Management',
  path: '/users',
  icon: UserCog,
  permission: MODULES.USERS,
  group: 'admin',
  phase: 2,
  description: 'Invite users, assign roles and access, and review the directory.',
  element: UsersListPage,
  sections: [
    { path: '', title: 'Users' },
    { path: 'roles', title: 'Roles & access', element: RolesListPage },
    { path: 'audit-log', title: 'Audit log' },
  ],
  routes: [
    { path: 'new', title: 'New user', element: UserFormPage, action: ACTIONS.CREATE },
    { path: ':id', element: UserDetailPage },
    { path: ':id/edit', element: UserFormPage, action: ACTIONS.UPDATE },
  ],
  capabilities: [
    'User directory with search, filter and pagination',
    'User creation and account activation/deactivation',
    'Role assignment with privilege escalation protection',
    'Role definitions and access scope overview',
  ],
};
