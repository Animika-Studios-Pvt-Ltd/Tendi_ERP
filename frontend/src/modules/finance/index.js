import { Wallet } from 'lucide-react';
import { createElement, lazy } from 'react';
import { MODULES } from '@/constants/permissions';

const FinanceWorkspacePage = lazy(() => import('./pages/FinanceWorkspacePage'));

const BudgetsTab = () => createElement(FinanceWorkspacePage, { initialTab: 'budgets' });
const ExpensesTab = () => createElement(FinanceWorkspacePage, { initialTab: 'expenses' });
const InvoicesTab = () => createElement(FinanceWorkspacePage, { initialTab: 'invoices' });
const PaymentsTab = () => createElement(FinanceWorkspacePage, { initialTab: 'payments' });

export default {
  key: MODULES.FINANCE,
  title: 'Budget & Finance',
  path: '/finance',
  icon: Wallet,
  permission: MODULES.FINANCE,
  group: 'commercial',
  phase: 4,
  description: 'Control project budgets and BOQs, approve expenses, and track invoices and payments.',
  element: BudgetsTab,
  sections: [
    { path: '', title: 'Budgets & BOQ', element: BudgetsTab },
    { path: 'expenses', title: 'Expenses', element: ExpensesTab },
    { path: 'invoices', title: 'Invoices', element: InvoicesTab },
    { path: 'payments', title: 'Payments', element: PaymentsTab },
  ],
  capabilities: [
    'Project budgets with revisions and live EAC commitments vs actual control',
    'Expense claims enforcing approval authority limits',
    'Vendor 3-way AP matching, Contractor payables, and Client AR invoicing',
    'Cash flow & atomic payment settlement ledger',
  ],
};
