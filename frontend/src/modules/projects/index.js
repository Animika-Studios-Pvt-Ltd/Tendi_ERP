import { FolderKanban } from 'lucide-react';
import { lazy } from 'react';
import { ACTIONS, MODULES } from '@/constants/permissions';

const ProjectsListPage = lazy(() => import('./pages/ProjectsListPage'));
const ProjectFormPage = lazy(() => import('./pages/ProjectFormPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const TasksListPage = lazy(() => import('./pages/TasksListPage'));
const MilestonesListPage = lazy(() => import('./pages/MilestonesListPage'));
const ProjectGanttPage = lazy(() => import('./pages/ProjectGanttPage'));

export default {
  key: MODULES.PROJECTS,
  title: 'Project Management',
  path: '/projects',
  icon: FolderKanban,
  permission: MODULES.PROJECTS,
  group: 'execution',
  phase: 2,
  description: 'Plan projects, break work into tasks and milestones, and track schedule and cost against baseline.',
  element: ProjectsListPage,
  sections: [
    { path: '', title: 'All projects' },
    { path: 'tasks', title: 'Tasks', element: TasksListPage },
    { path: 'milestones', title: 'Milestones', element: MilestonesListPage },
    { path: 'schedule', title: 'Schedule & Gantt', element: ProjectGanttPage },
  ],
  routes: [
    { path: 'new', title: 'New project', element: ProjectFormPage, action: ACTIONS.CREATE },
    { path: ':id', element: ProjectDetailPage },
    { path: ':id/edit', element: ProjectFormPage, action: ACTIONS.UPDATE },
  ],
  capabilities: [
    'Project register with client, location, value and timeline',
    'Work breakdown into tasks with owners, dependencies and progress',
    'Milestones with planned vs actual dates',
    'Team assignment that drives project-level data access',
  ],
};
