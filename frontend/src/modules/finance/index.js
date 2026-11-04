import { Wallet } from 'lucide-react';
import { MODULES } from '@/constants/permissions';

export default {
  key: MODULES.FINANCE,
  title: 'Budget & Finance',
  path: '/finance',
  icon: Wallet,
  permission: MODULES.FINANCE,
  group: 'commercial',
  phase: 4,
  description: 'Control project budgets and BOQs, approve expenses, and track invoices and payments.',
  sections: [
    { path: '', title: 'Budgets & BOQ' },
    { path: 'expenses', title: 'Expenses' },
    { path: 'invoices', title: 'Invoices' },
    { path: 'payments', title: 'Payments' },
  ],
  capabilities: [
    'Project budgets by cost head with BOQ line items',
    'Expense claims with project and category coding',
    'Client invoicing and payment receipts',
    'Budget vs actual cost reporting',
  ],
  workflow: {
    title: 'Expense control',
    steps: ['Expense submitted', 'Project and category selected', 'Approval', 'Accountant records payment', 'Project cost report updates'],
  },
};
