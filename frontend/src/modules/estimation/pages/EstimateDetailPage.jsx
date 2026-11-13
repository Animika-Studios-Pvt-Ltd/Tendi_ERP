import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  CopyPlus,
  ExternalLink,
  FolderPlus,
  History,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DataTable from '@/components/tables/DataTable';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useMasterData } from '@/hooks/useMasterData';
import { estimationService } from '@/services/estimation.service';
import { inventoryService } from '@/services/inventory.service';
import { projectsService } from '@/services/projects.service';
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';

const TABS = [
  { key: 'boq', label: 'BOQ & Quantity Takeoff' },
  { key: 'commercial', label: 'Pricing & Commercial Proposal' },
  { key: 'budget', label: 'Budget vs Actual Baseline' },
  { key: 'history', label: 'Approval History' },
];

export default function EstimateDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { units, costHeads } = useMasterData();

  const canCreate = can(MODULES.ESTIMATION, ACTIONS.CREATE);
  const canUpdate = can(MODULES.ESTIMATION, ACTIONS.UPDATE);
  const canApprove = can(MODULES.ESTIMATION, ACTIONS.APPROVE);
  const canReject = can(MODULES.ESTIMATION, ACTIONS.REJECT);

  const [tab, setTab] = useState('boq');
  const [state, setState] = useState({ estimate: null, budget: null, loading: true, error: null });
  const [rateAnalyses, setRateAnalyses] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [pms, setPms] = useState([]);
  const [actionError, setActionError] = useState(null);

  // Commercial form state
  const [commForm, setCommForm] = useState(null);
  const [savingComm, setSavingComm] = useState(false);

  // BOQ item modal
  const [boqModalOpen, setBoqModalOpen] = useState(false);
  const [editingBoq, setEditingBoq] = useState(null);
  const [boqForm, setBoqForm] = useState({
    wbsCode: '',
    workPackage: '',
    costHead: 'Superstructure & RCC',
    description: '',
    unit: 'cu.m',
    length: '',
    width: '',
    height: '',
    multiplier: '1',
    quantity: '',
    rateAnalysis: '',
    material: '',
    materialRate: '',
    labourRate: '',
    equipmentRate: '',
    subcontractorRate: '',
  });
  const [savingBoq, setSavingBoq] = useState(false);

  // Transition modal
  const [transitionModal, setTransitionModal] = useState({ open: false, status: '', comment: '', saving: false });

  // Convert-to-Project modal
  const [convertModal, setConvertModal] = useState({
    open: false,
    projectName: '',
    projectManager: '',
    startDate: new Date().toISOString().slice(0, 10),
    plannedEndDate: '',
    freezeBaseline: true,
    createWbsTasks: true,
    saving: false,
  });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [{ data: est }, budgetRes] = await Promise.all([
        estimationService.getEstimate(id),
        estimationService.getBudgetAnalysis(id).catch(() => ({ data: null })),
      ]);
      setState({ estimate: est, budget: budgetRes.data, loading: false, error: null });
      setCommForm({
        overheadPercent: String(est.overheadPercent ?? 10),
        contingencyPercent: String(est.contingencyPercent ?? 5),
        profitMarginPercent: String(est.profitMarginPercent ?? 12),
        gstPercent: String(est.gstPercent ?? 18),
        validityDays: String(est.validityDays ?? 30),
        paymentTerms: est.paymentTerms ?? '',
        proposalSummary: est.proposalSummary ?? '',
        assumptions: est.assumptions ?? '',
        exclusions: est.exclusions ?? '',
      });
    } catch (error) {
      setState({ estimate: null, budget: null, loading: false, error });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    estimationService.listRateAnalyses({ limit: 100 }).then(({ data }) => setRateAnalyses(data || [])).catch(() => {});
    inventoryService.listMaterials({ limit: 100 }).then(({ data }) => setMaterials(data || [])).catch(() => {});
    projectsService.lookupUsers({ forProjectManager: true }).then(({ data }) => setPms(data || [])).catch(() => {});
  }, []);

  if (state.loading) return <PageLoader />;
  if (state.error) return <ErrorState error={state.error} onRetry={load} />;
  const est = state.estimate;
  if (!est) return null;

  const isLocked = est.status === 'approved' || Boolean(est.convertedProject);

  const openNewBoq = () => {
    setEditingBoq(null);
    setBoqForm({
      wbsCode: '',
      workPackage: '',
      costHead: costHeads[0] || 'Superstructure & RCC',
      description: '',
      unit: units[0] || 'cu.m',
      length: '',
      width: '',
      height: '',
      multiplier: '1',
      quantity: '',
      rateAnalysis: '',
      material: '',
      materialRate: '',
      labourRate: '',
      equipmentRate: '',
      subcontractorRate: '',
    });
    setActionError(null);
    setBoqModalOpen(true);
  };

  const openEditBoq = (b) => {
    setEditingBoq(b);
    setBoqForm({
      wbsCode: b.wbsCode || '',
      workPackage: b.workPackage || '',
      costHead: b.costHead,
      description: b.description,
      unit: b.unit,
      length: b.takeoff?.length ? String(b.takeoff.length) : '',
      width: b.takeoff?.width ? String(b.takeoff.width) : '',
      height: b.takeoff?.height ? String(b.takeoff.height) : '',
      multiplier: String(b.takeoff?.multiplier ?? 1),
      quantity: String(b.quantity ?? ''),
      rateAnalysis: b.rateAnalysis?.id || '',
      material: b.material?.id || '',
      materialRate: String(b.materialRate ?? ''),
      labourRate: String(b.labourRate ?? ''),
      equipmentRate: String(b.equipmentRate ?? ''),
      subcontractorRate: String(b.subcontractorRate ?? ''),
    });
    setActionError(null);
    setBoqModalOpen(true);
  };

  const handlePickRa = (raId) => {
    const ra = rateAnalyses.find((r) => r.id === raId);
    setBoqForm((prev) => ({
      ...prev,
      rateAnalysis: raId,
      costHead: ra ? ra.costHead : prev.costHead,
      unit: ra ? ra.unit : prev.unit,
      description: !prev.description && ra ? ra.name : prev.description,
      materialRate: ra ? String(ra.materialUnitCost) : prev.materialRate,
      labourRate: ra ? String(ra.labourUnitCost) : prev.labourRate,
      equipmentRate: ra ? String(ra.equipmentUnitCost) : prev.equipmentRate,
    }));
  };

  const handleSaveBoq = async (e) => {
    e.preventDefault();
    setSavingBoq(true);
    setActionError(null);
    try {
      const payload = {
        wbsCode: boqForm.wbsCode.trim(),
        workPackage: boqForm.workPackage.trim(),
        costHead: boqForm.costHead,
        description: boqForm.description.trim(),
        unit: boqForm.unit,
        takeoff: {
          length: Number(boqForm.length || 0),
          width: Number(boqForm.width || 0),
          height: Number(boqForm.height || 0),
          multiplier: Number(boqForm.multiplier || 1),
        },
        ...(boqForm.quantity !== '' ? { quantity: Number(boqForm.quantity) } : {}),
        rateAnalysis: boqForm.rateAnalysis || null,
        material: boqForm.material || null,
        ...(boqForm.materialRate !== '' ? { materialRate: Number(boqForm.materialRate) } : {}),
        ...(boqForm.labourRate !== '' ? { labourRate: Number(boqForm.labourRate) } : {}),
        ...(boqForm.equipmentRate !== '' ? { equipmentRate: Number(boqForm.equipmentRate) } : {}),
        ...(boqForm.subcontractorRate !== '' ? { subcontractorRate: Number(boqForm.subcontractorRate) } : {}),
      };
      if (editingBoq) {
        await estimationService.updateBoqItem(est.id, editingBoq.id, payload);
      } else {
        await estimationService.addBoqItem(est.id, payload);
      }
      setBoqModalOpen(false);
      load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSavingBoq(false);
    }
  };

  const handleSaveCommercial = async (e) => {
    e.preventDefault();
    setSavingComm(true);
    setActionError(null);
    try {
      await estimationService.updateEstimate(est.id, {
        overheadPercent: Number(commForm.overheadPercent || 0),
        contingencyPercent: Number(commForm.contingencyPercent || 0),
        profitMarginPercent: Number(commForm.profitMarginPercent || 0),
        gstPercent: Number(commForm.gstPercent || 0),
        validityDays: Number(commForm.validityDays || 30),
        paymentTerms: commForm.paymentTerms,
        proposalSummary: commForm.proposalSummary,
        assumptions: commForm.assumptions,
        exclusions: commForm.exclusions,
      });
      load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSavingComm(false);
    }
  };

  const handleCreateRevision = async () => {
    setActionError(null);
    try {
      const { data } = await estimationService.reviseEstimate(est.id, {
        revisionNotes: `Revision from ${est.estimateNumber} v${est.version}`,
      });
      navigate(`/estimation/${data.id}`);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleTransition = async () => {
    setTransitionModal((prev) => ({ ...prev, saving: true }));
    setActionError(null);
    try {
      await estimationService.transitionEstimate(est.id, {
        status: transitionModal.status,
        comment: transitionModal.comment,
      });
      setTransitionModal({ open: false, status: '', comment: '', saving: false });
      load();
    } catch (err) {
      setActionError(err.message);
      setTransitionModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const handleConvert = async (e) => {
    e.preventDefault();
    setConvertModal((prev) => ({ ...prev, saving: true }));
    setActionError(null);
    try {
      const { data } = await estimationService.convertToProject(est.id, {
        projectName: convertModal.projectName.trim() || est.title,
        projectManager: convertModal.projectManager || null,
        startDate: convertModal.startDate || null,
        plannedEndDate: convertModal.plannedEndDate || null,
        freezeBaseline: convertModal.freezeBaseline,
        createWbsTasks: convertModal.createWbsTasks,
      });
      setConvertModal((prev) => ({ ...prev, open: false, saving: false }));
      navigate(`/projects/${data.project.id}`);
    } catch (err) {
      setActionError(err.message);
      setConvertModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const boqColumns = [
    {
      key: 'wbsCode',
      header: 'WBS / Cost Head',
      render: (b) => (
        <div className="text-xs">
          <span className="font-mono font-semibold text-ink">{b.wbsCode || '—'}</span>
          <p className="text-muted">{b.costHead}</p>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'BOQ Item',
      render: (b) => (
        <div>
          <p className="font-medium text-ink">{b.description}</p>
          {b.workPackage && <p className="text-[11px] text-muted">Package: {b.workPackage}</p>}
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Takeoff Qty',
      align: 'right',
      render: (b) => (
        <span className="tabular-nums text-xs font-medium text-ink">
          {b.quantity} {b.unit}
        </span>
      ),
    },
    {
      key: 'unitRate',
      header: 'Unit Rate',
      align: 'right',
      render: (b) => <span className="tabular-nums text-xs text-muted">{formatCurrencyCompact(b.unitRate)}</span>,
    },
    {
      key: 'amount',
      header: 'Direct Amount',
      align: 'right',
      render: (b) => <span className="tabular-nums text-xs font-semibold text-ink">{formatCurrency(b.amount)}</span>,
    },
    ...(!isLocked && canUpdate
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (b) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEditBoq(b)}>Edit</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await estimationService.deleteBoqItem(est.id, b.id);
                    load();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${est.estimateNumber} · ${est.title}`}
        description={`${est.client?.name || 'Internal Enquiry'}${est.enquiryCode ? ` · ${est.enquiryCode}` : ''}`}
        meta={
          <div className="flex items-center gap-1.5">
            <Badge tone="neutral">v{est.version}</Badge>
            <StatusBadge status={est.status} />
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" leftIcon={ArrowLeft} onClick={() => navigate('/estimation')}>
              Back
            </Button>
            {canCreate && (
              <Button variant="secondary" size="sm" leftIcon={CopyPlus} onClick={handleCreateRevision}>
                New Revision
              </Button>
            )}
            {['draft', 'returned'].includes(est.status) && canUpdate && (
              <Button
                size="sm"
                leftIcon={Send}
                onClick={() => setTransitionModal({ open: true, status: 'submitted', comment: '', saving: false })}
              >
                Submit for Approval
              </Button>
            )}
            {['submitted', 'under_review'].includes(est.status) && canApprove && (
              <Button
                size="sm"
                leftIcon={CheckCircle2}
                onClick={() => setTransitionModal({ open: true, status: 'approved', comment: '', saving: false })}
              >
                Approve
              </Button>
            )}
            {['submitted', 'under_review'].includes(est.status) && canApprove && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={RotateCcw}
                onClick={() => setTransitionModal({ open: true, status: 'returned', comment: '', saving: false })}
              >
                Return
              </Button>
            )}
            {['submitted', 'under_review'].includes(est.status) && canReject && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={XCircle}
                onClick={() => setTransitionModal({ open: true, status: 'rejected', comment: '', saving: false })}
              >
                Reject
              </Button>
            )}
            {est.status === 'approved' && !est.convertedProject && canApprove && (
              <Button
                size="sm"
                leftIcon={FolderPlus}
                onClick={() =>
                  setConvertModal((prev) => ({
                    ...prev,
                    open: true,
                    projectName: est.title,
                  }))
                }
              >
                Convert to Project
              </Button>
            )}
            {est.convertedProject && (
              <Button size="sm" variant="secondary" leftIcon={ExternalLink} onClick={() => navigate(`/projects/${est.convertedProject.id}`)}>
                Open {est.convertedProject.code}
              </Button>
            )}
          </div>
        }
      />

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {actionError}
        </div>
      )}

      {/* Summary metrics strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardBody className="py-3">
            <p className="text-xs text-muted">Direct BOQ Cost ({est.boqSummary?.itemCount ?? 0} items)</p>
            <p className="text-lg font-semibold text-ink">{formatCurrency(est.boqSummary?.directCost || 0)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-3">
            <p className="text-xs text-muted">Overheads + Contingency + Margin</p>
            <p className="text-lg font-semibold text-ink">
              {formatCurrency((est.overheadAmount || 0) + (est.contingencyAmount || 0) + (est.marginAmount || 0))}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-3">
            <p className="text-xs text-muted">Pre-Tax Proposal Total</p>
            <p className="text-lg font-semibold text-ink">{formatCurrency(est.subTotalBeforeTax || 0)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-3">
            <p className="text-xs text-muted">Quoted Total (incl. {est.gstPercent}% GST)</p>
            <p className="text-lg font-semibold text-brand-700">{formatCurrency(est.quotedTotal || 0)}</p>
          </CardBody>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t.key ? 'bg-brand-600 text-white' : 'text-muted hover:bg-surface-hover hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'boq' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">
              {isLocked
                ? 'This estimate is approved/converted and locked. Use New Revision to create an editable v+1 draft.'
                : 'Add quantity takeoffs manually or compute from L × W × H dimensions and Rate Analysis norms.'}
            </p>
            {!isLocked && canUpdate && (
              <Button size="sm" onClick={openNewBoq}>
                <Plus className="h-4 w-4" /> Add BOQ Item
              </Button>
            )}
          </div>
          <Card>
            <DataTable
              columns={boqColumns}
              data={est.boqItems || []}
              emptyTitle="No BOQ line items yet"
              emptyDescription="Add structural, finishing, MEP, or subcontract BOQ line items to calculate project cost."
            />
          </Card>
        </div>
      )}

      {tab === 'commercial' && commForm && (
        <form onSubmit={handleSaveCommercial} className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Markups, Taxes & Commercial Proposal Terms" />
            <CardBody className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-5">
                <div>
                  <label className="text-xs font-medium text-ink">Overhead %</label>
                  <Input disabled={isLocked} type="number" step="0.5" value={commForm.overheadPercent} onChange={(e) => setCommForm({ ...commForm, overheadPercent: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink">Contingency %</label>
                  <Input disabled={isLocked} type="number" step="0.5" value={commForm.contingencyPercent} onChange={(e) => setCommForm({ ...commForm, contingencyPercent: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink">Margin %</label>
                  <Input disabled={isLocked} type="number" step="0.5" value={commForm.profitMarginPercent} onChange={(e) => setCommForm({ ...commForm, profitMarginPercent: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink">GST %</label>
                  <Input disabled={isLocked} type="number" step="0.5" value={commForm.gstPercent} onChange={(e) => setCommForm({ ...commForm, gstPercent: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink">Validity (Days)</label>
                  <Input disabled={isLocked} type="number" value={commForm.validityDays} onChange={(e) => setCommForm({ ...commForm, validityDays: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-ink">Payment Terms</label>
                <Input disabled={isLocked} value={commForm.paymentTerms} onChange={(e) => setCommForm({ ...commForm, paymentTerms: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-ink">Commercial Proposal Summary</label>
                <Textarea disabled={isLocked} rows={3} value={commForm.proposalSummary} onChange={(e) => setCommForm({ ...commForm, proposalSummary: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-ink">Key Assumptions</label>
                  <Textarea disabled={isLocked} rows={2} value={commForm.assumptions} onChange={(e) => setCommForm({ ...commForm, assumptions: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink">Exclusions</label>
                  <Textarea disabled={isLocked} rows={2} value={commForm.exclusions} onChange={(e) => setCommForm({ ...commForm, exclusions: e.target.value })} />
                </div>
              </div>
            </CardBody>
            {!isLocked && canUpdate && (
              <CardFooter className="flex justify-end">
                <Button type="submit" disabled={savingComm}>
                  <Save className="h-4 w-4" /> {savingComm ? 'Saving…' : 'Update Commercial Terms'}
                </Button>
              </CardFooter>
            )}
          </Card>

          <Card>
            <CardHeader title="Commercial Price Build-up" />
            <CardBody className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted">Material Direct</span><span>{formatCurrency(est.boqSummary?.materialTotal || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Labour Direct</span><span>{formatCurrency(est.boqSummary?.labourTotal || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Equipment Direct</span><span>{formatCurrency(est.boqSummary?.equipmentTotal || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Subcontract Direct</span><span>{formatCurrency(est.boqSummary?.subcontractorTotal || 0)}</span></div>
              <div className="flex justify-between border-t border-border pt-2 font-medium"><span>Total Direct Cost</span><span>{formatCurrency(est.boqSummary?.directCost || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Site Overhead ({est.overheadPercent}%)</span><span>{formatCurrency(est.overheadAmount)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Contingency ({est.contingencyPercent}%)</span><span>{formatCurrency(est.contingencyAmount)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Profit Margin ({est.profitMarginPercent}%)</span><span>{formatCurrency(est.marginAmount)}</span></div>
              <div className="flex justify-between border-t border-border pt-2 font-medium"><span>Basic Quote</span><span>{formatCurrency(est.subTotalBeforeTax)}</span></div>
              <div className="flex justify-between"><span className="text-muted">GST ({est.gstPercent}%)</span><span>{formatCurrency(est.taxAmount)}</span></div>
              <div className="flex justify-between border-t border-border pt-2 text-sm font-bold text-ink"><span>Final Quoted Total</span><span>{formatCurrency(est.quotedTotal)}</span></div>
            </CardBody>
          </Card>
        </form>
      )}

      {tab === 'budget' && state.budget && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Card><CardBody className="py-3"><p className="text-xs text-muted">Direct Baseline Budget</p><p className="text-base font-semibold">{formatCurrency(state.budget.totals.directBaseline)}</p></CardBody></Card>
            <Card><CardBody className="py-3"><p className="text-xs text-muted">PO Commitments</p><p className="text-base font-semibold text-amber-700">{formatCurrency(state.budget.totals.committedPoTotal)}</p></CardBody></Card>
            <Card><CardBody className="py-3"><p className="text-xs text-muted">Material Issues (Actual)</p><p className="text-base font-semibold text-brand-700">{formatCurrency(state.budget.totals.actualMaterialIssued)}</p></CardBody></Card>
            <Card><CardBody className="py-3"><p className="text-xs text-muted">Remaining Direct Budget</p><p className="text-base font-semibold text-emerald-700">{formatCurrency(state.budget.totals.remainingDirectBudget)}</p></CardBody></Card>
          </div>
          <Card>
            <CardHeader title="Cost-Head Baseline Breakdown" />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-surface-muted text-muted">
                    <tr>
                      <th className="px-4 py-2">Cost Head</th>
                      <th className="px-4 py-2 text-right">Items</th>
                      <th className="px-4 py-2 text-right">Material</th>
                      <th className="px-4 py-2 text-right">Labour</th>
                      <th className="px-4 py-2 text-right">Equipment</th>
                      <th className="px-4 py-2 text-right">Subcontract</th>
                      <th className="px-4 py-2 text-right">Planned Direct</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {state.budget.costHeads.map((c) => (
                      <tr key={c.costHead}>
                        <td className="px-4 py-2 font-medium text-ink">{c.costHead}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{c.itemCount}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(c.plannedMaterial)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(c.plannedLabour)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(c.plannedEquipment)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(c.plannedSubcontractor)}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatCurrency(c.plannedDirectCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'history' && (
        <Card>
          <CardHeader title="Approval Workflow Audit Trail" />
          <CardBody>
            {(!est.approvalHistory || est.approvalHistory.length === 0) ? (
              <p className="text-xs text-muted">No workflow transitions recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {est.approvalHistory.map((h, i) => (
                  <div key={i} className="flex items-start justify-between rounded-md border border-border px-3 py-2 text-xs">
                    <div>
                      <p className="font-medium text-ink">
                        {h.fromStatus} → {h.toStatus}
                      </p>
                      <p className="text-muted">{h.comment || 'No comment'}</p>
                    </div>
                    <div className="text-right text-muted">
                      <p>{h.by?.fullName || 'System'}</p>
                      <p>{formatDate(h.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Add/Edit BOQ Item Modal */}
      {boqModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <form onSubmit={handleSaveBoq}>
              <CardHeader title={editingBoq ? 'Edit BOQ Item' : 'Add BOQ & Takeoff Line'} />
              <CardBody className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-ink">Cost Head *</label>
                    <Select value={boqForm.costHead} onChange={(e) => setBoqForm({ ...boqForm, costHead: e.target.value })} options={costHeads.map((c) => ({ value: c, label: c }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Rate Analysis Template (Optional)</label>
                    <Select
                      value={boqForm.rateAnalysis}
                      onChange={(e) => handlePickRa(e.target.value)}
                      placeholder="Custom rate entry"
                      options={rateAnalyses.map((r) => ({ value: r.id, label: `${r.code} · ${r.name} (₹${r.directRate})` }))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-ink">Work Item Description *</label>
                    <Input required value={boqForm.description} onChange={(e) => setBoqForm({ ...boqForm, description: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">WBS Code</label>
                    <Input value={boqForm.wbsCode} onChange={(e) => setBoqForm({ ...boqForm, wbsCode: e.target.value })} placeholder="e.g. 1.1" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Work Package</label>
                    <Input value={boqForm.workPackage} onChange={(e) => setBoqForm({ ...boqForm, workPackage: e.target.value })} placeholder="Substructure / Superstructure" />
                  </div>
                </div>

                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink"><Calculator className="h-3.5 w-3.5" /> Quantity Takeoff (Enter explicit Quantity or L × W × H × Nos)</p>
                  <div className="grid gap-2 sm:grid-cols-6">
                    <Input placeholder="L" type="number" step="0.01" value={boqForm.length} onChange={(e) => setBoqForm({ ...boqForm, length: e.target.value })} />
                    <Input placeholder="W" type="number" step="0.01" value={boqForm.width} onChange={(e) => setBoqForm({ ...boqForm, width: e.target.value })} />
                    <Input placeholder="H" type="number" step="0.01" value={boqForm.height} onChange={(e) => setBoqForm({ ...boqForm, height: e.target.value })} />
                    <Input placeholder="Nos" type="number" step="0.01" value={boqForm.multiplier} onChange={(e) => setBoqForm({ ...boqForm, multiplier: e.target.value })} />
                    <Input placeholder="Qty override" type="number" step="0.01" value={boqForm.quantity} onChange={(e) => setBoqForm({ ...boqForm, quantity: e.target.value })} />
                    <Select value={boqForm.unit} onChange={(e) => setBoqForm({ ...boqForm, unit: e.target.value })} options={units.map((u) => ({ value: u, label: u }))} />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-5">
                  <div>
                    <label className="text-[11px] text-muted">Material Link</label>
                    <Select value={boqForm.material} onChange={(e) => setBoqForm({ ...boqForm, material: e.target.value })} placeholder="None" options={materials.map((m) => ({ value: m.id, label: m.name }))} />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted">Material ₹/unit</label>
                    <Input type="number" step="0.01" value={boqForm.materialRate} onChange={(e) => setBoqForm({ ...boqForm, materialRate: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted">Labour ₹/unit</label>
                    <Input type="number" step="0.01" value={boqForm.labourRate} onChange={(e) => setBoqForm({ ...boqForm, labourRate: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted">Equip ₹/unit</label>
                    <Input type="number" step="0.01" value={boqForm.equipmentRate} onChange={(e) => setBoqForm({ ...boqForm, equipmentRate: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted">Subcontract ₹</label>
                    <Input type="number" step="0.01" value={boqForm.subcontractorRate} onChange={(e) => setBoqForm({ ...boqForm, subcontractorRate: e.target.value })} />
                  </div>
                </div>
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setBoqModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={savingBoq}>{savingBoq ? 'Saving…' : 'Save BOQ Line'}</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* Workflow Transition Modal */}
      {transitionModal.open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader title={`Confirm Estimate ${transitionModal.status}`} />
            <CardBody className="space-y-3">
              <label className="text-xs font-medium text-ink">Decision / Submission Notes</label>
              <Textarea
                rows={3}
                value={transitionModal.comment}
                onChange={(e) => setTransitionModal((prev) => ({ ...prev, comment: e.target.value }))}
                placeholder="Enter review notes…"
              />
            </CardBody>
            <CardFooter className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setTransitionModal({ open: false, status: '', comment: '', saving: false })}>Cancel</Button>
              <Button disabled={transitionModal.saving} onClick={handleTransition}>Confirm</Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Convert Approved Estimate to Project Modal */}
      {convertModal.open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg">
            <form onSubmit={handleConvert}>
              <CardHeader title="Convert Estimate to Active Project & Baseline" description={`Contract value will initialize to ${formatCurrency(est.quotedTotal)}.`} />
              <CardBody className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-ink">Project Name *</label>
                  <Input required value={convertModal.projectName} onChange={(e) => setConvertModal((p) => ({ ...p, projectName: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink">Project Manager</label>
                  <Select
                    value={convertModal.projectManager}
                    onChange={(e) => setConvertModal((p) => ({ ...p, projectManager: e.target.value }))}
                    placeholder="Current user (default)"
                    options={pms.map((u) => ({ value: u.id, label: `${u.fullName} (${u.designation || u.email})` }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ink">Start Date</label>
                    <Input type="date" value={convertModal.startDate} onChange={(e) => setConvertModal((p) => ({ ...p, startDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Planned End Date</label>
                    <Input type="date" value={convertModal.plannedEndDate} onChange={(e) => setConvertModal((p) => ({ ...p, plannedEndDate: e.target.value }))} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-ink">
                  <input type="checkbox" checked={convertModal.freezeBaseline} onChange={(e) => setConvertModal((p) => ({ ...p, freezeBaseline: e.target.checked }))} />
                  Freeze initial Project Baseline immediately
                </label>
                <label className="flex items-center gap-2 text-xs text-ink">
                  <input type="checkbox" checked={convertModal.createWbsTasks} onChange={(e) => setConvertModal((p) => ({ ...p, createWbsTasks: e.target.checked }))} />
                  Auto-seed WBS Tasks from BOQ work packages
                </label>
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setConvertModal((p) => ({ ...p, open: false }))}>Cancel</Button>
                <Button type="submit" disabled={convertModal.saving}>{convertModal.saving ? 'Converting…' : 'Create Project & Baseline'}</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
