/** Must stay in sync with backend/src/models/Project.js */
export const PROJECT_STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const TASK_STATUS_OPTIONS = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'under_review', label: 'Under review' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
];

export const TASK_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export const MILESTONE_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'achieved', label: 'Achieved' },
  { value: 'delayed', label: 'Delayed' },
];

export const RISK_CATEGORY_OPTIONS = [
  { value: 'technical', label: 'Technical' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'financial', label: 'Financial' },
  { value: 'safety', label: 'Safety' },
  { value: 'regulatory', label: 'Regulatory' },
  { value: 'supply_chain', label: 'Supply chain' },
  { value: 'weather', label: 'Weather' },
  { value: 'other', label: 'Other' },
];

export const RISK_LEVEL_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const RISK_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'mitigated', label: 'Mitigated' },
  { value: 'occurred', label: 'Occurred' },
  { value: 'closed', label: 'Closed' },
];

export const CHANGE_ORDER_TYPE_OPTIONS = [
  { value: 'combined', label: 'Combined (Cost + Schedule)' },
  { value: 'scope', label: 'Scope Change' },
  { value: 'cost', label: 'Cost Variation' },
  { value: 'schedule', label: 'Schedule Extension' },
];
