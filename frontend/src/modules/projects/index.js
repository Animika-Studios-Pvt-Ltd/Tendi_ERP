import { FolderKanban } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.PROJECTS,
  title: 'Project Management',
  path: '/projects',
  icon: FolderKanban,
  permission: MODULES.PROJECTS,
  group: 'execution',
  phase: 2,
  description: 'Plan projects, break work into tasks and milestones, and track schedule and cost against baseline.',
  sections: [
    { path: '', title: 'All projects' },
    { path: 'tasks', title: 'Tasks' },
    { path: 'milestones', title: 'Milestones' },
  ],
  capabilities: [
    'Project register with client, location, value and timeline',
    'Work breakdown into tasks with owners, dependencies and progress',
    'Milestones with planned vs actual dates',
    'Team assignment that drives project-level data access',
  ],
};
