import contractors from './contractors';
import crm from './crm';
import dashboard from './dashboard';
import documents from './documents';
import equipment from './equipment';
import estimation from './estimation';
import finance from './finance';
import hr from './hr';
import inventory from './inventory';
import legal from './legal';
import procurement from './procurement';
import projects from './projects';
import qualitySafety from './quality-safety';
import reports from './reports';
import settings from './settings';
import sites from './sites';
import users from './users';

/**
 * Single source of truth for navigation, routes, breadcrumbs and global search.
 * To ship a module screen, add `element` (lazy page) to its manifest, or
 * `element` on a section for nested pages. `routes` adds pages that are not in the
 * navigation (create, detail, edit): [{ path, element, action?, title? }].
 */
export const NAV_GROUPS = [
  { key: 'overview', label: null },
  { key: 'execution', label: 'Execution' },
  { key: 'supply', label: 'Supply chain' },
  { key: 'commercial', label: 'Commercial & people' },
  { key: 'assets', label: 'Assets & compliance' },
  { key: 'insight', label: 'Insight' },
  { key: 'admin', label: 'Administration' },
];

export const MODULE_REGISTRY = [
  dashboard,
  projects,
  sites,
  inventory,
  procurement,
  estimation,
  finance,
  hr,
  contractors,
  crm,
  equipment,
  qualitySafety,
  documents,
  legal,
  reports,
  users,
  settings,
];

export const sectionPath = (module, section) => (section.path ? `${module.path}/${section.path}` : module.path);

/** Flat list of every navigable page for breadcrumbs and global search. */
export const ROUTE_INDEX = MODULE_REGISTRY.flatMap((module) => [
  { path: module.path, title: module.title, module },
  ...(module.sections ?? [])
    .filter((section) => section.path)
    .map((section) => ({ path: sectionPath(module, section), title: section.title, module, section })),
  // Static extra pages (e.g. /projects/new) get breadcrumbs; dynamic ones set their own titles.
  ...(module.routes ?? [])
    .filter((route) => route.title && !route.path.includes(':'))
    .map((route) => ({ path: `${module.path}/${route.path}`, title: route.title, module, hidden: true })),
]);

export const STATIC_ROUTES = [{ path: '/profile', title: 'My profile' }];

export function findRoute(pathname) {
  return [...ROUTE_INDEX, ...STATIC_ROUTES].find((route) => route.path === pathname);
}
