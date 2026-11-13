import { CheckCircle2, IndianRupee, Plus, Receipt, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useWorkingProjectFilter } from '@/hooks/useWorkingProjectFilter';
import { erpService } from '@/services/erp.service';
import { projectsService } from '@/services/projects.service';
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/utils/format';

export default function FinanceWorkspacePage({ initialTab = 'budgets' }) {
  const { can } = useAuth();
  const canCreate = can(MODULES.FINANCE, ACTIONS.CREATE);
  const canApprove = can(MODULES.FINANCE, ACTIONS.APPROVE);
  const [selectedProjectId] = useWorkingProjectFilter();

  const [tab, setTab] = useState(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  const [projects, setProjects] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [cashFlow, setCashFlow] = useState(null);
  const [costControl, setCostControl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bannerError, setBannerError] = useState(null);

  const [budgetModal, setBudgetModal] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ project: '', originalBudget: '', contingencyAmount: '0' });
  const [expModal, setExpModal] = useState(false);
  const [expForm, setExpForm] = useState({ project: '', description: '', amount: '', vendorName: '', costHead: 'Site Overheads' });
  const [invModal, setInvModal] = useState(false);
  const [invForm, setInvForm] = useState({ invoiceType: 'client_ar', project: '', clientName: '', subtotal: '', cgstAmount: '0', sgstAmount: '0', tdsPercent: '0' });
  const [payModal, setPayModal] = useState({ open: false, invoice: null, amount: '', mode: 'neft', referenceNo: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = selectedProjectId ? { project: selectedProjectId } : {};
    try {
      const [bRes, eRes, iRes, pRes, cfRes] = await Promise.all([
        erpService.finance.listBudgets(params),
        erpService.finance.listExpenses(params),
        erpService.finance.listInvoices(params),
        erpService.finance.listPayments(params),
        erpService.finance.getCashFlow(params),
      ]);
      setBudgets(bRes.data || []);
      setExpenses(eRes.data || []);
      setInvoices(iRes.data || []);
      setPayments(pRes.data || []);
      setCashFlow(cfRes.data);
      const activeProj = selectedProjectId || bRes.data?.[0]?.project?._id;
      if (activeProj) {
        const cc = await erpService.finance.getCostControl(activeProj).catch(() => ({ data: null }));
        setCostControl(cc.data);
      } else {
        setCostControl(null);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    load();
    projectsService.list({ limit: 100 }).then(({ data }) => setProjects(data || [])).catch(() => {});
  }, [load]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Budget, Finance & Cost Control"
        description="Manage project budgets, expenses with approval limits, AP/AR/Contractor invoices, and cash flow."
        actions={
          canCreate && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" leftIcon={Wallet} onClick={() => setBudgetModal(true)}>New Budget</Button>
              <Button size="sm" variant="secondary" leftIcon={Receipt} onClick={() => setInvModal(true)}>New Invoice</Button>
              <Button size="sm" leftIcon={Plus} onClick={() => setExpModal(true)}>Log Expense</Button>
            </div>
          )
        }
      />

      {bannerError && <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{bannerError}</div>}

      {cashFlow && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Card><CardBody className="py-3"><p className="text-xs text-muted">Total Inflows (AR)</p><p className="text-lg font-semibold text-emerald-700">{formatCurrencyCompact(cashFlow.totalInflow)}</p></CardBody></Card>
          <Card><CardBody className="py-3"><p className="text-xs text-muted">Total Outflows (AP)</p><p className="text-lg font-semibold text-red-700">{formatCurrencyCompact(cashFlow.totalOutflow)}</p></CardBody></Card>
          <Card><CardBody className="py-3"><p className="text-xs text-muted">Net Cash Flow</p><p className="text-lg font-semibold text-ink">{formatCurrencyCompact(cashFlow.netCashFlow)}</p></CardBody></Card>
          <Card><CardBody className="py-3"><p className="text-xs text-muted">Receivables / Payables</p><p className="text-sm font-semibold text-ink">{formatCurrencyCompact(cashFlow.receivablesPending)} / {formatCurrencyCompact(cashFlow.payablesPending)}</p></CardBody></Card>
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-line pb-1">
        {[
          { key: 'budgets', label: 'Budgets & Cost Control' },
          { key: 'expenses', label: 'Expenses' },
          { key: 'invoices', label: 'Invoices' },
          { key: 'payments', label: 'Payments' },
        ].map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t.key ? 'bg-navy-900 text-white' : 'text-muted hover:bg-canvas'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'budgets' && (
        <div className="space-y-4">
          {costControl && (
            <Card>
              <CardHeader title={`Cost Control & EAC Forecast · ${costControl.project.code}`} icon={IndianRupee} />
              <CardBody className="grid gap-3 text-xs sm:grid-cols-5">
                <div><p className="text-muted">Revised Budget</p><p className="text-base font-semibold">{formatCurrency(costControl.revisedBudget)}</p></div>
                <div><p className="text-muted">PO + WO Commitments</p><p className="text-base font-semibold text-amber-700">{formatCurrency(costControl.commitments.totalCommitted)}</p></div>
                <div><p className="text-muted">Actual Cost to Date</p><p className="text-base font-semibold text-navy-700">{formatCurrency(costControl.actuals.totalActualCost)}</p></div>
                <div><p className="text-muted">Forecast EAC</p><p className="text-base font-semibold">{formatCurrency(costControl.forecastEac)}</p></div>
                <div><p className="text-muted">Budget Variance</p><p className={`text-base font-semibold ${costControl.variance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(costControl.variance)}</p></div>
              </CardBody>
            </Card>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {budgets.map((b) => (
              <Card key={b.id}>
                <CardBody className="space-y-1 text-xs">
                  <p className="font-semibold text-ink">{b.project?.code} · {b.project?.name}</p>
                  <p>Original: {formatCurrency(b.originalBudget)} · Revised: <strong>{formatCurrency(b.revisedBudget)}</strong></p>
                  <p className="text-muted">{b.revisionHistory?.length || 0} revision(s)</p>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="space-y-2">
          {expenses.map((ex) => (
            <Card key={ex.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                <div>
                  <p className="font-semibold text-ink">{ex.expenseNumber} · {ex.description}</p>
                  <p className="text-muted">{ex.project?.code} · {formatDate(ex.expenseDate)} · {formatCurrency(ex.totalAmount)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={ex.status} />
                  {ex.status === 'draft' && canCreate && (
                    <Button size="sm" variant="secondary" onClick={async () => { await erpService.finance.transitionExpense(ex.id, { status: 'submitted' }); load(); }}>Submit</Button>
                  )}
                  {ex.status === 'submitted' && canApprove && (
                    <Button size="sm" leftIcon={CheckCircle2} onClick={async () => {
                      setBannerError(null);
                      try { await erpService.finance.transitionExpense(ex.id, { status: 'approved' }); load(); }
                      catch (err) { setBannerError(err.message); }
                    }}>Approve</Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'invoices' && (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <Card key={inv.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-ink">{inv.invoiceNumber}</span>
                    <Badge tone="neutral">{inv.invoiceType}</Badge>
                    {inv.threeWayMatchPassed && <Badge tone="success">3-Way Matched</Badge>}
                  </div>
                  <p className="text-muted">{inv.project?.code} · Net Payable: <strong>{formatCurrency(inv.netPayable)}</strong> · Due: <strong>{formatCurrency(inv.balanceDue)}</strong></p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={inv.status} />
                  {inv.balanceDue > 0.01 && canCreate && (
                    <Button size="sm" variant="secondary" onClick={() => setPayModal({ open: true, invoice: inv, amount: String(inv.balanceDue), mode: 'neft', referenceNo: '' })}>Record Payment</Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'payments' && (
        <div className="space-y-2">
          {payments.map((p) => (
            <Card key={p.id}>
              <CardBody className="flex items-center justify-between py-3 text-xs">
                <div>
                  <p className="font-semibold text-ink">{p.paymentNumber} · {p.direction.toUpperCase()}</p>
                  <p className="text-muted">{p.project?.code} · Invoice {p.invoice?.invoiceNumber} · {p.mode.toUpperCase()} {p.referenceNo}</p>
                </div>
                <strong>{formatCurrency(p.amount)}</strong>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {budgetModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={async (e) => {
              e.preventDefault();
              setBannerError(null);
              try {
                await erpService.finance.createBudget({ project: budgetForm.project || selectedProjectId, originalBudget: Number(budgetForm.originalBudget), contingencyAmount: Number(budgetForm.contingencyAmount) });
                setBudgetModal(false);
                load();
              } catch (err) { setBannerError(err.message); }
            }}>
              <CardHeader title="Create Project Budget" />
              <CardBody className="space-y-3">
                <Select required value={budgetForm.project || selectedProjectId} onChange={(e) => setBudgetForm({ ...budgetForm, project: e.target.value })} placeholder="Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Input required type="number" placeholder="Original Budget (₹) *" value={budgetForm.originalBudget} onChange={(e) => setBudgetForm({ ...budgetForm, originalBudget: e.target.value })} />
                <Input type="number" placeholder="Contingency (₹)" value={budgetForm.contingencyAmount} onChange={(e) => setBudgetForm({ ...budgetForm, contingencyAmount: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setBudgetModal(false)}>Cancel</Button>
                <Button type="submit">Save Budget</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {expModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={async (e) => {
              e.preventDefault();
              await erpService.finance.createExpense({ ...expForm, project: expForm.project || selectedProjectId, amount: Number(expForm.amount) });
              setExpModal(false);
              load();
            }}>
              <CardHeader title="Log Project Expense" />
              <CardBody className="space-y-3">
                <Select required value={expForm.project || selectedProjectId} onChange={(e) => setExpForm({ ...expForm, project: e.target.value })} placeholder="Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Input required placeholder="Description *" value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} />
                <Input required type="number" step="0.01" placeholder="Amount (₹) *" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} />
                <Input placeholder="Payee / Vendor" value={expForm.vendorName} onChange={(e) => setExpForm({ ...expForm, vendorName: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setExpModal(false)}>Cancel</Button>
                <Button type="submit">Save Expense</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {invModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={async (e) => {
              e.preventDefault();
              await erpService.finance.createInvoice({ ...invForm, project: invForm.project || selectedProjectId, subtotal: Number(invForm.subtotal), cgstAmount: Number(invForm.cgstAmount), sgstAmount: Number(invForm.sgstAmount), tdsPercent: Number(invForm.tdsPercent) });
              setInvModal(false);
              load();
            }}>
              <CardHeader title="Create Invoice" />
              <CardBody className="space-y-3">
                <Select value={invForm.invoiceType} onChange={(e) => setInvForm({ ...invForm, invoiceType: e.target.value })} options={[{ value: 'client_ar', label: 'Client Receivable (AR)' }, { value: 'vendor_ap', label: 'Vendor Payable (AP)' }]} />
                <Select required value={invForm.project || selectedProjectId} onChange={(e) => setInvForm({ ...invForm, project: e.target.value })} placeholder="Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Input placeholder="Party / Client Name" value={invForm.clientName} onChange={(e) => setInvForm({ ...invForm, clientName: e.target.value })} />
                <Input required type="number" step="0.01" placeholder="Subtotal (₹) *" value={invForm.subtotal} onChange={(e) => setInvForm({ ...invForm, subtotal: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setInvModal(false)}>Cancel</Button>
                <Button type="submit">Create Invoice</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {payModal.open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={async (e) => {
              e.preventDefault();
              await erpService.finance.createPayment({ invoice: payModal.invoice.id, amount: Number(payModal.amount), mode: payModal.mode, referenceNo: payModal.referenceNo });
              setPayModal({ open: false, invoice: null, amount: '', mode: 'neft', referenceNo: '' });
              load();
            }}>
              <CardHeader title={`Record Payment · ${payModal.invoice?.invoiceNumber}`} />
              <CardBody className="space-y-3">
                <Input required type="number" step="0.01" placeholder="Amount *" value={payModal.amount} onChange={(e) => setPayModal((p) => ({ ...p, amount: e.target.value }))} />
                <Select value={payModal.mode} onChange={(e) => setPayModal((p) => ({ ...p, mode: e.target.value }))} options={['neft', 'rtgs', 'cheque', 'upi', 'cash'].map((m) => ({ value: m, label: m.toUpperCase() }))} />
                <Input placeholder="Bank Reference / UTR" value={payModal.referenceNo} onChange={(e) => setPayModal((p) => ({ ...p, referenceNo: e.target.value }))} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setPayModal({ open: false, invoice: null, amount: '', mode: 'neft', referenceNo: '' })}>Cancel</Button>
                <Button type="submit">Confirm Payment</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

