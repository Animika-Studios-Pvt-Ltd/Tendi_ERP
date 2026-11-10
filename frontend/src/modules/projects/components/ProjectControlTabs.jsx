import { AlertTriangle, CheckCircle2, FileDiff, Lock, Plus, Send, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import StatusBadge from '@/components/common/StatusBadge';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { projectsService } from '@/services/projects.service';
import { formatCurrencyCompact, formatDate } from '@/utils/format';
import {
  CHANGE_ORDER_TYPE_OPTIONS,
  RISK_CATEGORY_OPTIONS,
  RISK_LEVEL_OPTIONS,
  RISK_STATUS_OPTIONS,
} from '../constants';

const SEVERITY_TONES = { low: 'neutral', medium: 'info', high: 'warning', critical: 'danger' };

export function RisksPanel({ projectId, risks, canCreate, canUpdate, canDelete, onRefresh }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('technical');
  const [probability, setProbability] = useState('medium');
  const [impact, setImpact] = useState('medium');
  const [status, setStatus] = useState('open');
  const [dueDate, setDueDate] = useState('');
  const [mitigationPlan, setMitigationPlan] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const openNew = () => {
    setEditing(null);
    setTitle('');
    setCategory('technical');
    setProbability('medium');
    setImpact('medium');
    setStatus('open');
    setDueDate('');
    setMitigationPlan('');
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    setTitle(r.title);
    setCategory(r.category);
    setProbability(r.probability);
    setImpact(r.impact);
    setStatus(r.status);
    setDueDate(r.dueDate ? r.dueDate.slice(0, 10) : '');
    setMitigationPlan(r.mitigationPlan || '');
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        category,
        probability,
        impact,
        status,
        dueDate: dueDate || null,
        mitigationPlan: mitigationPlan.trim(),
      };
      if (editing) {
        await projectsService.updateRisk(projectId, editing.id, payload);
      } else {
        await projectsService.createRisk(projectId, payload);
      }
      setModalOpen(false);
      onRefresh();
    } catch (err) {
      setError(err.message || 'Failed to save risk');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete risk ${r.riskNumber}?`)) return;
    await projectsService.deleteRisk(projectId, r.id);
    onRefresh();
  };

  return (
    <>
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-lg shadow-overlay">
            <CardHeader title={editing ? `Edit Risk (${editing.riskNumber})` : 'Log Project Risk'} />
            <form onSubmit={handleSave}>
              <CardBody className="space-y-3">
                {error && <div className="rounded border border-danger-200 bg-danger-50 p-2.5 text-xs text-danger-700">{error}</div>}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Risk Title *</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Delay in ready-mix concrete supply" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Category</label>
                    <Select value={category} onChange={(e) => setCategory(e.target.value)} options={RISK_CATEGORY_OPTIONS} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Status</label>
                    <Select value={status} onChange={(e) => setStatus(e.target.value)} options={RISK_STATUS_OPTIONS} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Probability</label>
                    <Select value={probability} onChange={(e) => setProbability(e.target.value)} options={RISK_LEVEL_OPTIONS} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Impact</label>
                    <Select value={impact} onChange={(e) => setImpact(e.target.value)} options={RISK_LEVEL_OPTIONS} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Target Date</label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Mitigation Plan</label>
                  <Textarea rows={3} value={mitigationPlan} onChange={(e) => setMitigationPlan(e.target.value)} placeholder="Preventive & contingency actions..." />
                </div>
              </CardBody>
              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit" loading={saving}>{editing ? 'Save risk' : 'Log risk'}</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader
          icon={AlertTriangle}
          title="Risk Register"
          description={`${risks.length} logged risk(s)`}
          action={canCreate && <Button size="sm" leftIcon={Plus} onClick={openNew}>Log risk</Button>}
        />
        <CardBody className="p-0">
          {risks.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No project risks logged yet.</p>
          ) : (
            <div className="divide-y divide-line">
              {risks.map((r) => (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 hover:bg-navy-50/30">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-navy-700">{r.riskNumber}</span>
                      <Badge tone={SEVERITY_TONES[r.severity] || 'neutral'} className="uppercase">{r.severity}</Badge>
                      <StatusBadge status={r.status} />
                      <span className="text-xs capitalize text-muted">{r.category.replace('_', ' ')}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-ink">{r.title}</p>
                    {r.mitigationPlan && <p className="mt-0.5 text-xs text-muted">Mitigation: {r.mitigationPlan}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.dueDate && <span className="tabular text-xs text-muted">{formatDate(r.dueDate)}</span>}
                    {canUpdate && <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit</Button>}
                    {canDelete && (
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(r)}>
                        <Trash2 size={14} className="text-danger-600" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}

export function ChangeOrdersPanel({ projectId, changeOrders, canCreate, canUpdate, canApprove, canReject, onRefresh }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('combined');
  const [costImpact, setCostImpact] = useState('0');
  const [scheduleImpactDays, setScheduleImpactDays] = useState('0');
  const [reason, setReason] = useState('');
  const [clientApprovalRequired, setClientApprovalRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await projectsService.createChangeOrder(projectId, {
        title: title.trim(),
        type,
        costImpact: Number(costImpact) || 0,
        scheduleImpactDays: Number(scheduleImpactDays) || 0,
        reason: reason.trim(),
        clientApprovalRequired,
      });
      setModalOpen(false);
      setTitle('');
      setReason('');
      onRefresh();
    } catch (err) {
      setError(err.message || 'Failed to create change order');
    } finally {
      setSaving(false);
    }
  };

  const handleTransition = async (co, status) => {
    let comment;
    let clientApproved;
    if (status === 'rejected' || status === 'returned') {
      comment = window.prompt(`Enter reason for marking ${co.changeNumber} as ${status}:`);
      if (!comment || !comment.trim()) return;
    }
    if (status === 'approved' && co.clientApprovalRequired && !co.clientApproved) {
      const ok = window.confirm('Confirm client written approval has been received for this variation order?');
      if (!ok) return;
      clientApproved = true;
    }
    setBusyId(co.id);
    try {
      await projectsService.transitionChangeOrder(projectId, co.id, { status, comment, clientApproved });
      onRefresh();
    } catch (err) {
      alert(err.message || 'Failed to update change order status');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-lg shadow-overlay">
            <CardHeader title="New Change Request / Variation Order" />
            <form onSubmit={handleCreate}>
              <CardBody className="space-y-3">
                {error && <div className="rounded border border-danger-200 bg-danger-50 p-2.5 text-xs text-danger-700">{error}</div>}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Title *</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Additional basement waterproofing scope" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Variation Type</label>
                  <Select value={type} onChange={(e) => setType(e.target.value)} options={CHANGE_ORDER_TYPE_OPTIONS} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Cost Impact (INR)</label>
                    <Input type="number" value={costImpact} onChange={(e) => setCostImpact(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Schedule Impact (Days)</label>
                    <Input type="number" value={scheduleImpactDays} onChange={(e) => setScheduleImpactDays(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Justification / Reason</label>
                  <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Engineering or client instruction basis..." />
                </div>
                <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                  <input type="checkbox" checked={clientApprovalRequired} onChange={(e) => setClientApprovalRequired(e.target.checked)} />
                  Requires formal client approval before execution
                </label>
              </CardBody>
              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit" loading={saving}>Draft change order</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader
          icon={FileDiff}
          title="Change Requests & Variation Orders"
          description="Approved variations update contract value & planned finish while preserving original baseline"
          action={canCreate && <Button size="sm" leftIcon={Plus} onClick={() => setModalOpen(true)}>New change order</Button>}
        />
        <CardBody className="p-0">
          {changeOrders.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No change requests recorded for this project.</p>
          ) : (
            <div className="divide-y divide-line">
              {changeOrders.map((co) => (
                <div key={co.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 hover:bg-navy-50/30">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-navy-700">{co.changeNumber}</span>
                      <StatusBadge status={co.status} />
                      <Badge tone="neutral" className="capitalize">{co.type}</Badge>
                      {co.clientApprovalRequired && (
                        <Badge tone={co.clientApproved ? 'success' : 'warning'}>
                          {co.clientApproved ? 'Client approved' : 'Client approval req.'}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-medium text-ink">{co.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      Cost impact: <strong className="text-ink">{formatCurrencyCompact(co.costImpact)}</strong> · Schedule:{' '}
                      <strong className="text-ink">{co.scheduleImpactDays > 0 ? `+${co.scheduleImpactDays}` : co.scheduleImpactDays} days</strong>
                      {co.reason ? ` · ${co.reason}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {['draft', 'returned', 'rejected'].includes(co.status) && canUpdate && (
                      <Button size="sm" variant="secondary" leftIcon={Send} loading={busyId === co.id} onClick={() => handleTransition(co, 'submitted')}>
                        Submit
                      </Button>
                    )}
                    {['submitted', 'under_review'].includes(co.status) && canApprove && (
                      <Button size="sm" leftIcon={CheckCircle2} loading={busyId === co.id} onClick={() => handleTransition(co, 'approved')}>
                        Approve
                      </Button>
                    )}
                    {['submitted', 'under_review'].includes(co.status) && canReject && (
                      <Button size="sm" variant="outline" leftIcon={XCircle} loading={busyId === co.id} onClick={() => handleTransition(co, 'rejected')}>
                        Reject
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}

export function ReadinessClosurePanel({ project, readiness, canUpdate, onRefresh }) {
  const [checklist, setChecklist] = useState(readiness?.checklist || {
    finalInspectionCompleted: false,
    punchListCleared: false,
    asBuiltSubmitted: false,
    finalAccountsSettled: false,
    clientHandoverCompleted: false,
    warrantyMonths: 12,
    remarks: '',
  });
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState(null);

  const toggle = (key) => setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleClose = async (forceClose = false) => {
    setClosing(true);
    setError(null);
    try {
      await projectsService.closeProject(project.id, {
        closureChecklist: checklist,
        forceClose,
      });
      onRefresh();
    } catch (err) {
      setError(err.message || 'Project closure failed');
    } finally {
      setClosing(false);
    }
  };

  if (!readiness) return null;
  const isCompleted = project.status === 'completed';

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          icon={ShieldCheck}
          title="System Readiness Gate"
          description={readiness.ready ? 'All automated project checks clear' : `${readiness.blockers.length} open item(s) detected`}
        />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded border border-line p-2.5">Open Tasks: <strong>{readiness.metrics.openTasks}</strong></div>
            <div className="rounded border border-line p-2.5">Pending Milestones: <strong>{readiness.metrics.pendingMilestones}</strong></div>
            <div className="rounded border border-line p-2.5">Unapproved DPRs: <strong>{readiness.metrics.pendingDprs}</strong></div>
            <div className="rounded border border-line p-2.5">Pending MRs / POs: <strong>{readiness.metrics.pendingMrs + readiness.metrics.openPos}</strong></div>
            <div className="rounded border border-line p-2.5">High/Critical Risks: <strong>{readiness.metrics.highOpenRisks}</strong></div>
            <div className="rounded border border-line p-2.5">Pending Change Orders: <strong>{readiness.metrics.pendingChangeOrders}</strong></div>
          </div>
          {readiness.blockers.length > 0 && (
            <div className="rounded-md border border-warning-200 bg-warning-50 p-3 text-xs text-warning-900">
              <p className="font-semibold">Outstanding blockers:</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {readiness.blockers.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={Lock} title="Handover & Closure Checklist" description="Confirm completion milestones before closing" />
        <CardBody className="space-y-2.5 text-xs">
          {error && <div className="rounded border border-danger-200 bg-danger-50 p-2.5 text-danger-700">{error}</div>}
          {[
            ['finalInspectionCompleted', 'Final site inspection completed'],
            ['punchListCleared', 'Snag / punch list defects rectified'],
            ['asBuiltSubmitted', 'As-built drawings and manuals handed over'],
            ['finalAccountsSettled', 'Contractor & vendor final accounts settled'],
            ['clientHandoverCompleted', 'Formal client handover signed off'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2.5 cursor-pointer text-ink">
              <input type="checkbox" checked={Boolean(checklist[key])} disabled={isCompleted} onChange={() => toggle(key)} />
              {label}
            </label>
          ))}
          <div className="pt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-semibold text-ink">Warranty (Months)</label>
              <Input
                type="number"
                min="0"
                disabled={isCompleted}
                value={checklist.warrantyMonths}
                onChange={(e) => setChecklist((p) => ({ ...p, warrantyMonths: Number(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block font-semibold text-ink">Closure Remarks</label>
            <Textarea
              rows={2}
              disabled={isCompleted}
              value={checklist.remarks || ''}
              onChange={(e) => setChecklist((p) => ({ ...p, remarks: e.target.value }))}
            />
          </div>
        </CardBody>
        {!isCompleted && canUpdate && (
          <CardFooter className="justify-end gap-2">
            <Button variant="secondary" loading={closing} onClick={() => handleClose(true)}>
              Admin Force Close
            </Button>
            <Button loading={closing} onClick={() => handleClose(false)}>
              Complete & Close Project
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

