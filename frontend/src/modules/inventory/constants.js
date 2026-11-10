export const TRANSACTION_TYPE_OPTIONS = [
  { value: 'opening', label: 'Opening Balance' },
  { value: 'receipt', label: 'Direct Receipt' },
  { value: 'issue', label: 'Issue to Site / Contractor' },
  { value: 'return', label: 'Return to Store' },
  { value: 'adjustment', label: 'Stock Adjustment' },
];

export const ALL_TRANSACTION_FILTER_OPTIONS = [
  { value: '', label: 'All types' },
  ...TRANSACTION_TYPE_OPTIONS,
  { value: 'transfer_in', label: 'Transfer In' },
  { value: 'transfer_out', label: 'Transfer Out' },
];

export const DEFAULT_CATEGORIES = [
  'Cement & Concrete',
  'Steel & Reinforcement',
  'Aggregates & Sand',
  'Bricks & Blocks',
  'Electrical',
  'Plumbing & Sanitary',
  'Finishing & Paint',
  'Safety & PPE',
];

export const DEFAULT_UNITS = [
  'bags',
  'tonnes',
  'kg',
  'cu.m',
  'sq.ft',
  'rft',
  'nos',
  'liters',
  'hours',
  'days',
];

