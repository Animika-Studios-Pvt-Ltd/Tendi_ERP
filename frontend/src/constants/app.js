export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Ten.Di ERP';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const STORAGE_KEYS = Object.freeze({
  SIDEBAR_COLLAPSED: 'lumos.sidebarCollapsed',
  SELECTED_PROJECT: 'lumos.selectedProject',
});

export const AUTH_EVENTS = Object.freeze({
  UNAUTHORIZED: 'lumos:unauthorized',
});

/** Workflow status labels and badge tones, shared by every approval-driven module. */
export const STATUS_META = Object.freeze({
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'info' },
  under_review: { label: 'Under review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  on_track: { label: 'On track', tone: 'success' },
  at_risk: { label: 'At risk', tone: 'warning' },
  delayed: { label: 'Delayed', tone: 'danger' },
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
  low_stock: { label: 'Low stock', tone: 'warning' },
  out_of_stock: { label: 'Out of stock', tone: 'danger' },
});
