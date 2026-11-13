import { Briefcase, CheckCircle2, Plus, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useWorkingProjectFilter } from '@/hooks/useWorkingProjectFilter';
import { erpService } from '@/services/erp.service';
import { projectsService } from '@/services/projects.service';
import { formatCurrency } from '@/utils/format';

export default function ContractorsWorkspacePage({ initialTab = 'contractors' }) {
  const { can } = useAuth();
  const canCreate = can(MODULES.CONTRACTORS, ACTIONS.CREATE);
  const canApprove = can(MODULES.CONTRACTORS, ACTIONS.APPROVE);
  const canReject = canApprove || can(MODULES.CONTRACTORS, ACTIONS.REJECT);
  const [selectedProjectId] = useWorkingProjectFilter();

  const [tab, setTab] = useState(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  const [contractors, setContractors] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [bills, setBills] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bannerError, setBannerError] = useState('');

  const [conModal, setConModal] = useState(false);
  const [conForm, setConForm] = useState({ companyName: '', contactPerson: '', phone: '' });
  const [woModal, setWoModal] = useState(false);
  const [woForm, setWoForm] = useState({ project: '', contractor: '', title: '', contractValue: '' });
  const [mbModal, setMbModal] = useState(false);
  const [mbForm, setMbForm] = useState({ workOrder: '', description: '', unit: 'cum', quantity: '', rate: '' });
  const [billModal, setBillModal] = useState(false);
  const [billForm, setBillForm] = useState({ workOrder: '', cumulativeWorkValue: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setBannerError('');
    try {
      const params = selectedProjectId ? { project: selectedProjectId } : {};
      const [c, w, m, b] = await Promise.all([
        erpService.contractors.listContractors(),
        erpService.contractors.listWorkOrders(params),
        erpService.contractors.listMeasurements(params),
        erpService.contractors.listBills(params),
      ]);
      setContractors(c.data || []);
      setWorkOrders(w.data || []);
      setMeasurements(m.data || []);
      setBills(b.data || []);
    } catch (err) {
      setBannerError(err?.response?.data?.message || err?.message || 'Failed to load contractor data');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  const runAction = async (fn) => {
    setBannerError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setBannerError(err?.response?.data?.message || err?.message || 'Operation failed');
    }
  };

  useEffect(() => {
    load();
    projectsService.list({ limit: 100 }).then(({ data }) => setProjects(data || [])).catch(() => {});
  }, [load]);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contractor Management"
        description="Subcontractor register, work orders, measurement books, cumulative RA bills, and retention control."
        actions={
          canCreate && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setConModal(true)}>Contractor</Button>
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setWoModal(true)}>Work Order</Button>
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setMbModal(true)}>MB Entry</Button>
              <Button size="sm" leftIcon={Plus} onClick={() => setBillModal(true)}>Raise RA Bill</Button>
            </div>
          )
        }
      />

      {bannerError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{bannerError}</div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-line pb-1">
        {[
          { key: 'contractors', label: 'Contractors' },
          { key: 'work-orders', label: 'Work Orders' },
          { key: 'measurements', label: 'Measurement Book' },
          { key: 'bills', label: 'Contractor RA Bills' },
        ].map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t.key ? 'bg-navy-900 text-white' : 'text-muted hover:bg-canvas'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'contractors' && (
        <div className="grid gap-3 md:grid-cols-3">
          {contractors.length === 0 ? (
            <Card className="md:col-span-3"><CardBody className="py-8 text-center text-xs text-muted">No contractors registered yet. Use &ldquo;+ Contractor&rdquo; to add one.</CardBody></Card>
          ) : contractors.map((c) => (
            <Card key={c.id}>
              <CardBody className="space-y-1 text-xs">
                <p className="font-mono font-semibold">{c.code}</p>
                <p className="text-sm font-medium text-ink">{c.companyName}</p>
                <p className="text-muted">{c.contactPerson || '—'} · {c.phone || '—'}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'work-orders' && (
        <div className="space-y-2">
          {workOrders.length === 0 ? (
            <Card><CardBody className="py-8 text-center text-xs text-muted">No work orders issued for this scope yet.</CardBody></Card>
          ) : workOrders.map((w) => (
            <Card key={w.id}>
              <CardBody className="flex items-center justify-between py-3 text-xs">
                <div>
                  <p className="font-semibold text-ink">{w.woNumber} · {w.title}</p>
                  <p className="text-muted">{w.project?.code} · {w.contractor?.companyName} · Ret {w.retentionPercent}%</p>
                </div>
                <strong>{formatCurrency(w.contractValue)}</strong>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'measurements' && (
        <div className="space-y-2">
          {measurements.length === 0 ? (
            <Card><CardBody className="py-8 text-center text-xs text-muted">No measurement book entries recorded yet. Click &ldquo;+ MB Entry&rdquo; to log measured work.</CardBody></Card>
          ) : measurements.map((m) => (
            <Card key={m.id}>
              <CardBody className="flex items-center justify-between py-3 text-xs">
                <div>
                  <p className="font-semibold text-ink">{m.mbNumber} · {m.description}</p>
                  <p className="text-muted">{m.workOrder?.woNumber} · {m.quantity} {m.unit} @ {formatCurrency(m.rate)}</p>
                </div>
                <strong>{formatCurrency(m.amount)}</strong>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'bills' && (
        <div className="space-y-2">
          {bills.length === 0 ? (
            <Card><CardBody className="py-8 text-center text-xs text-muted">No RA bills raised yet.</CardBody></Card>
          ) : bills.map((b) => (
            <Card key={b.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                <div>
                  <p className="font-semibold text-ink">{b.billNumber} · {b.contractor?.companyName}</p>
                  <p className="text-muted">Gross: {formatCurrency(b.grossCurrentBill)} · Net Payable: <strong>{formatCurrency(b.netPayable)}</strong>{b.financeInvoice ? ` · Finance ${b.financeInvoice.invoiceNumber}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={b.status} />
                  {b.status === 'draft' && canCreate && (
                    <Button size="sm" variant="secondary" onClick={() => runAction(() => erpService.contractors.transitionBill(b.id, { status: 'submitted' }))}>Submit</Button>
                  )}
                  {b.status === 'submitted' && canApprove && (
                    <Button size="sm" leftIcon={CheckCircle2} onClick={() => runAction(() => erpService.contractors.transitionBill(b.id, { status: 'approved' }))}>Approve</Button>
                  )}
                  {b.status === 'submitted' && canReject && (
                    <Button size="sm" variant="danger" leftIcon={XCircle} onClick={() => runAction(() => erpService.contractors.transitionBill(b.id, { status: 'rejected' }))}>Reject</Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {conModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.contractors.createContractor(conForm); setConForm({ companyName: '', contactPerson: '', phone: '' }); setConModal(false); }); }}>
              <CardHeader title="Register Contractor" icon={Briefcase} />
              <CardBody className="space-y-3">
                <Input required placeholder="Company Name *" value={conForm.companyName} onChange={(e) => setConForm({ ...conForm, companyName: e.target.value })} />
                <Input placeholder="Contact Person" value={conForm.contactPerson} onChange={(e) => setConForm({ ...conForm, contactPerson: e.target.value })} />
                <Input placeholder="Phone" value={conForm.phone} onChange={(e) => setConForm({ ...conForm, phone: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setConModal(false)}>Cancel</Button>
                <Button type="submit">Save</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {woModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.contractors.createWorkOrder({ ...woForm, project: woForm.project || selectedProjectId, contractValue: Number(woForm.contractValue) }); setWoForm({ project: '', contractor: '', title: '', contractValue: '' }); setWoModal(false); }); }}>
              <CardHeader title="Create Work Order" />
              <CardBody className="space-y-3">
                <Select required value={woForm.project || selectedProjectId} onChange={(e) => setWoForm({ ...woForm, project: e.target.value })} placeholder="Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Select required value={woForm.contractor} onChange={(e) => setWoForm({ ...woForm, contractor: e.target.value })} placeholder="Contractor *" options={contractors.map((c) => ({ value: c.id, label: c.companyName }))} />
                <Input required placeholder="Scope Title *" value={woForm.title} onChange={(e) => setWoForm({ ...woForm, title: e.target.value })} />
                <Input required type="number" placeholder="Contract Value (₹) *" value={woForm.contractValue} onChange={(e) => setWoForm({ ...woForm, contractValue: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setWoModal(false)}>Cancel</Button>
                <Button type="submit">Create WO</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {mbModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.contractors.createMeasurement({ workOrder: mbForm.workOrder, description: mbForm.description, unit: mbForm.unit, quantity: Number(mbForm.quantity), rate: Number(mbForm.rate) }); setMbForm({ workOrder: '', description: '', unit: 'cum', quantity: '', rate: '' }); setMbModal(false); }); }}>
              <CardHeader title="Record Measurement Book (MB) Entry" />
              <CardBody className="space-y-3">
                <Select required value={mbForm.workOrder} onChange={(e) => setMbForm({ ...mbForm, workOrder: e.target.value })} placeholder="Work Order *" options={workOrders.map((w) => ({ value: w.id, label: `${w.woNumber} · ${w.title}` }))} />
                <Input required placeholder="Work Item Description *" value={mbForm.description} onChange={(e) => setMbForm({ ...mbForm, description: e.target.value })} />
                <div className="grid grid-cols-3 gap-2">
                  <Input required placeholder="Unit *" value={mbForm.unit} onChange={(e) => setMbForm({ ...mbForm, unit: e.target.value })} />
                  <Input required type="number" step="0.01" placeholder="Qty *" value={mbForm.quantity} onChange={(e) => setMbForm({ ...mbForm, quantity: e.target.value })} />
                  <Input required type="number" step="0.01" placeholder="Rate (₹) *" value={mbForm.rate} onChange={(e) => setMbForm({ ...mbForm, rate: e.target.value })} />
                </div>
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setMbModal(false)}>Cancel</Button>
                <Button type="submit">Save MB Entry</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {billModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.contractors.createBill({ workOrder: billForm.workOrder, cumulativeWorkValue: Number(billForm.cumulativeWorkValue) }); setBillForm({ workOrder: '', cumulativeWorkValue: '' }); setBillModal(false); }); }}>
              <CardHeader title="Raise RA Bill" />
              <CardBody className="space-y-3">
                <Select required value={billForm.workOrder} onChange={(e) => setBillForm({ ...billForm, workOrder: e.target.value })} placeholder="Work Order *" options={workOrders.map((w) => ({ value: w.id, label: `${w.woNumber} · ${w.title}` }))} />
                <Input required type="number" placeholder="Cumulative Work Value (₹) *" value={billForm.cumulativeWorkValue} onChange={(e) => setBillForm({ ...billForm, cumulativeWorkValue: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setBillModal(false)}>Cancel</Button>
                <Button type="submit">Generate RA Bill</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

