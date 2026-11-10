/** Must stay in sync with backend/src/config/rbac.js */
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

export const ROLE_KEYS = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  COMPANY_ADMIN: 'company_admin',
  PROJECT_MANAGER: 'project_manager',
  SITE_ENGINEER: 'site_engineer',
  ACCOUNTANT: 'accountant',
  HR_MANAGER: 'hr_manager',
  PROCUREMENT_MANAGER: 'procurement_manager',
  STORE_MANAGER: 'store_manager',
  LEGAL_MANAGER: 'legal_manager',
  CONTRACTOR: 'contractor',
  CUSTOMER: 'customer',
  ACCOUNTANT_HR: 'accountant_hr',
});
