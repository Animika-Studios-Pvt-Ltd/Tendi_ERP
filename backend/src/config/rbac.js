/**
 * RBAC catalogue. Module keys must stay in sync with frontend/src/constants/permissions.js.
 * Role documents in MongoDB are seeded from DEFAULT_ROLES and can be customised later
 * from User & Access Management; this file only defines the system defaults.
 */

export const MODULES = Object.freeze({
  DASHBOARD: 'dashboard',
  PROJECTS: 'projects',
  SITES: 'sites',
  INVENTORY: 'inventory',
  PROCUREMENT: 'procurement',
  FINANCE: 'finance',
  HR: 'hr',
  CONTRACTORS: 'contractors',
  CRM: 'crm',
  EQUIPMENT: 'equipment',
  QUALITY_SAFETY: 'quality-safety',
  DOCUMENTS: 'documents',
  REPORTS: 'reports',
  USERS: 'users',
  SETTINGS: 'settings',
});

export const ACTIONS = Object.freeze({
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  APPROVE: 'approve',
  REJECT: 'reject',
});

export const MODULE_LIST = Object.values(MODULES);
export const ACTION_LIST = Object.values(ACTIONS);

export const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  COMPANY_ADMIN: 'company_admin',
  PROJECT_MANAGER: 'project_manager',
  SITE_ENGINEER: 'site_engineer',
  ACCOUNTANT: 'accountant',
  HR_MANAGER: 'hr_manager',
  PROCUREMENT_MANAGER: 'procurement_manager',
  STORE_MANAGER: 'store_manager',
  CONTRACTOR: 'contractor',
  CUSTOMER: 'customer',
  LEGAL_MANAGER: 'legal_manager',
  ACCOUNTANT_HR: 'accountant_hr',
});

/**
 * Data scope decides which project records a role can see:
 *  - all:      every project in the company
 *  - assigned: only projects listed in user.assignedProjects
 *  - own:      only records the user created or is linked to (contractor/customer portals)
 */
export const DATA_SCOPES = Object.freeze({ ALL: 'all', ASSIGNED: 'assigned', OWN: 'own' });

const { CREATE: C, READ: R, UPDATE: U, DELETE: D, APPROVE: A, REJECT: X } = ACTIONS;
const FULL = [C, R, U, D, A, X];
const allModules = (actions) => Object.fromEntries(MODULE_LIST.map((module) => [module, actions]));

export const DEFAULT_ROLES = [
  {
    key: ROLES.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Full platform access, including role and permission management.',
    dataScope: DATA_SCOPES.ALL,
    permissions: allModules(FULL),
  },
  {
    key: ROLES.COMPANY_ADMIN,
    name: 'Company Admin',
    description: 'Manages company operations, users and settings. Cannot manage Super Admins.',
    dataScope: DATA_SCOPES.ALL,
    permissions: allModules(FULL),
  },
  {
    key: ROLES.PROJECT_MANAGER,
    name: 'Project Manager',
    description: 'Plans and controls assigned projects and approves site-level requests.',
    dataScope: DATA_SCOPES.ASSIGNED,
    permissions: {
      dashboard: [R],
      projects: [C, R, U, A, X],
      sites: [C, R, U, A, X],
      inventory: [R],
      procurement: [C, R, U, A, X],
      finance: [C, R, A, X],
      hr: [R],
      contractors: [R, U, A, X],
      crm: [R],
      equipment: [R, U],
      'quality-safety': [C, R, U, A, X],
      documents: [C, R, U],
      reports: [R],
    },
  },
  {
    key: ROLES.SITE_ENGINEER,
    name: 'Site Engineer',
    description: 'Records daily site progress, labour, material requests and site issues.',
    dataScope: DATA_SCOPES.ASSIGNED,
    permissions: {
      dashboard: [R],
      projects: [R],
      sites: [C, R, U],
      inventory: [R],
      procurement: [C, R],
      finance: [C, R],
      hr: [C, R, U],
      contractors: [R, U],
      equipment: [R, U],
      'quality-safety': [C, R, U],
      documents: [C, R],
    },
  },
  {
    key: ROLES.ACCOUNTANT,
    name: 'Accountant',
    description: 'Records payments, manages budgets, invoices, billing and financial ledger.',
    dataScope: DATA_SCOPES.ASSIGNED,
    permissions: {
      dashboard: [R],
      projects: [R],
      procurement: [R],
      finance: FULL,
      documents: [C, R],
      reports: [R],
    },
  },
  {
    key: ROLES.HR_MANAGER,
    name: 'HR Manager',
    description: 'Manages employees, labour records, attendance, leaves and contractor onboarding.',
    dataScope: DATA_SCOPES.ASSIGNED,
    permissions: {
      dashboard: [R],
      projects: [R],
      hr: FULL,
      contractors: [R, U, A, X],
      documents: [C, R],
      reports: [R],
    },
  },
  {
    key: ROLES.PROCUREMENT_MANAGER,
    name: 'Procurement Manager',
    description: 'Manages material requests, vendors, quotations, purchase orders and comparative statements.',
    dataScope: DATA_SCOPES.ASSIGNED,
    permissions: {
      dashboard: [R],
      projects: [R],
      inventory: [R],
      procurement: FULL,
      contractors: [R],
      documents: [C, R],
      reports: [R],
    },
  },
  {
    key: ROLES.STORE_MANAGER,
    name: 'Store Manager',
    description: 'Manages stock, warehouse inventory, goods receipt (GRN), issues and equipment tracking.',
    dataScope: DATA_SCOPES.ASSIGNED,
    permissions: {
      dashboard: [R],
      projects: [R],
      sites: [R],
      inventory: FULL,
      procurement: [C, R, U],
      equipment: [R, U],
      documents: [C, R],
      reports: [R],
    },
  },
  {
    key: ROLES.LEGAL_MANAGER,
    name: 'Legal Manager',
    description: 'Oversees regulatory compliance, agreements, contracts and disputes.',
    dataScope: DATA_SCOPES.ASSIGNED,
    permissions: {
      dashboard: [R],
      projects: [R],
      contractors: [R, U],
      crm: [R],
      'quality-safety': [R],
      documents: FULL,
      reports: [R],
    },
  },
  {
    key: ROLES.CONTRACTOR,
    name: 'Contractor',
    description: 'Views assigned work orders and submits measurement bills.',
    dataScope: DATA_SCOPES.OWN,
    permissions: {
      dashboard: [R],
      projects: [R],
      contractors: [C, R, U],
      'quality-safety': [R],
      documents: [C, R],
    },
  },
  {
    key: ROLES.CUSTOMER,
    name: 'Customer',
    description: 'Tracks their own project progress, documents and enquiries.',
    dataScope: DATA_SCOPES.OWN,
    permissions: {
      dashboard: [R],
      projects: [R],
      crm: [C, R],
      documents: [R],
    },
  },
  {
    key: ROLES.ACCOUNTANT_HR,
    name: 'Accountant / HR Manager',
    description: 'Combined role for managing finance, payments and personnel.',
    dataScope: DATA_SCOPES.ASSIGNED,
    permissions: {
      dashboard: [R],
      projects: [R],
      procurement: [R],
      finance: FULL,
      hr: FULL,
      contractors: [R, U, A, X],
      documents: [C, R],
      reports: [R],
    },
  },
];

/** Converts { module: actions[] } to the array shape stored on Role documents. */
export function toPermissionEntries(permissionMap) {
  return Object.entries(permissionMap).map(([module, actions]) => ({ module, actions: [...new Set(actions)] }));
}
