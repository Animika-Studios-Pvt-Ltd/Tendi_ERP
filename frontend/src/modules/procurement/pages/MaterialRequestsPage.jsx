import { CheckCircle2, Plus, Send, Trash2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import DataTable from '@/components/tables/DataTable';
import TableToolbar from '@/components/tables/TableToolbar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useWorkingProjectFilter } from '@/hooks/useWorkingProjectFilter';
import { inventoryService } from '@/services/inventory.service';
import { procurementService } from '@/services/procurement.service';
import { projectsService } from '@/services/projects.service';
import { formatDate } from '@/utils/format';

const PAGE_SIZE = 20;

const PRIORITY_TONES = { normal: 'neutral', urgent: 'warning', critical: 'danger' };

export default function MaterialRequestsPage() {
  const { can } = useAuth();
  const canCreate = can(MODULES.PROCUREMENT, ACTIONS.CREATE);
  const canApprove = can(MODULES.PROCUREMENT, ACTIONS.APPROVE);
  const canReject = can(MODULES.PROCUREMENT, ACTIONS.REJECT);

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useWorkingProjectFilter();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim());

  const [projects, setProjects] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [state, setState] = useState({ data: [], meta: null, loading: true, error: null });

  // Create Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [mrProject, setMrProject] = useState('');
  const [mrDate, setMrDate] = useState('');
  const [mrPriority, setMrPriority] = useState('normal');
  const [mrRemarks, setMrRemarks] = useState('');
  const [mrItems, setMrItems] = useState([{ material: '', quantity: '1', unit: 'bags', notes: '' }]);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Detail / Approval Modal
  const [selectedMr, setSelectedMr] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      projectsService.list({ limit: 100 }),
      inventoryService.listMaterials({ limit: 100, isActive: true }),
    ])
      .then(([pRes, mRes]) => {
        setProjects(pRes.data || []);
        setMaterials(mRes.data || []);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, meta } = await procurementService.listRequests({
        q: q || undefined,
        project: projectFilter || undefined,
        status: statusFilter || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setState({ data, meta, loading: false, error: null });
    } catch (error) {
      setState({ data: [], meta: null, loading: false, error });
    }
  }, [q, projectFilter, statusFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setPage(1), [q, projectFilter, statusFilter]);

  const openCreate = () => {
    setMrProject(projectFilter || projects[0]?.id || '');
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    setMrDate(nextWeek);
    setMrPriority('normal');
    setMrRemarks('');
    const defaultMat = materials[0];
    setMrItems([
      {
        material: defaultMat?.id || '',
        quantity: '10',
        unit: defaultMat?.unit || 'bags',
        notes: '',
      },
    ]);
    setFormError(null);
    setCreateOpen(true);
  };

  const updateItemRow = (idx, field, value) => {
    setMrItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        if (field === 'material') {
          const mat = materials.find((m) => m.id === value);
          return { ...row, material: value, unit: mat?.unit || row.unit };
        }
        return { ...row, [field]: value };
      }),
    );
  };

  const handleCreate = async (submitImmediately = false) => {
    setFormError(null);
    const validItems = mrItems.filter((i) => i.material && Number(i.quantity) > 0);
    if (!mrProject || !mrDate || validItems.length === 0) {
      setFormError('Select a project, required-by date, and at least one material item.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await procurementService.createRequest({
        project: mrProject,
        requiredByDate: mrDate,
        priority: mrPriority,
        remarks: mrRemarks,
        items: validItems.map((i) => ({ ...i, quantity: Number(i.quantity) })),
      });
      if (submitImmediately) {
        await procurementService.transitionRequest(data.id, { status: 'submitted' });
      }
      setCreateOpen(false);
      load();
    } catch (err) {
      setFormError(err.message || 'Failed to create material request');
    } finally {
      setSaving(false);
    }
  };

  const handleTransition = async (mrId, status, comment) => {
    setActionLoading(true);
    try {
      const { data } = await procurementService.transitionRequest(mrId, { status, comment });
      setSelectedMr(data);
      setRejectReason('');
      load();
    } catch (err) {
      alert(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      key: 'requestNumber',
      header: 'MR #',
      render: (mr) => (
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-ink">{mr.requestNumber}</p>
          <p className="tabular text-[11px] text-muted">Req by: {formatDate(mr.requiredByDate)}</p>
        </div>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      render: (mr) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink">{mr.project?.name}</p>
          <p className="tabular text-[11px] text-muted">{mr.project?.code}</p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items Requested',
      render: (mr) => (
        <span className="text-xs text-ink">
          {mr.items?.length} {mr.items?.length === 1 ? 'material' : 'materials'}
          {mr.items?.[0]?.material ? ` (${mr.items[0].material.name}…)` : ''}
        </span>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (mr) => (
        <Badge tone={PRIORITY_TONES[mr.priority] || 'neutral'} className="capitalize">
          {mr.priority}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (mr) => <StatusBadge status={mr.status} />,
    },
    {
      key: 'requestedBy',
      header: 'Requested By',
      className: 'text-xs text-muted',
      render: (mr) => mr.createdBy?.fullName || '—',
    },
  ];

  return (
    <>
      <PageHeader
        title="Material Requests (MR)"
        description="Site requisitions for materials with priority tracking and approval workflow."
        actions={
          canCreate && (
            <Button leftIcon={Plus} onClick={openCreate}>
              New material request
            </Button>
          )
        }
      />

      {/* Create Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-2xl shadow-overlay max-h-[90vh] overflow-y-auto">
            <CardHeader title="Create Material Request" />
            <CardBody className="space-y-4">
              {formError && (
                <div className="rounded border border-danger-200 bg-danger-50 p-2.5 text-xs text-danger-700">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Project *</label>
                  <Select
                    value={mrProject}
                    onChange={(e) => setMrProject(e.target.value)}
                    options={projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Required By *</label>
                  <Input type="date" value={mrDate} onChange={(e) => setMrDate(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Priority</label>
                  <Select
                    value={mrPriority}
                    onChange={(e) => setMrPriority(e.target.value)}
                    options={[
                      { value: 'normal', label: 'Normal' },
                      { value: 'urgent', label: 'Urgent' },
                      { value: 'critical', label: 'Critical' },
                    ]}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink">Requested Materials *</label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    leftIcon={Plus}
                    onClick={() =>
                      setMrItems((prev) => [
                        ...prev,
                        { material: materials[0]?.id || '', quantity: '1', unit: materials[0]?.unit || 'bags', notes: '' },
                      ])
                    }
                  >
                    Add row
                  </Button>
                </div>
                {mrItems.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Select
                        size="sm"
                        value={row.material}
                        onChange={(e) => updateItemRow(idx, 'material', e.target.value)}
                        options={[
                          { value: '', label: 'Select material…' },
                          ...materials.map((m) => ({ value: m.id, label: `${m.code} - ${m.name}` })),
                        ]}
                      />
                    </div>
                    <div className="w-24">
                      <Input
                        size="sm"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={row.quantity}
                        onChange={(e) => updateItemRow(idx, 'quantity', e.target.value)}
                      />
                    </div>
                    <div className="w-24">
                      <Input size="sm" value={row.unit} readOnly className="bg-navy-50/50" />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={mrItems.length <= 1}
                      onClick={() => setMrItems((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4 text-muted hover:text-danger-600" />
                    </Button>
                  </div>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Justification / Remarks</label>
                <Textarea
                  rows={2}
                  value={mrRemarks}
                  onChange={(e) => setMrRemarks(e.target.value)}
                  placeholder="Purpose or work zone reference..."
                />
              </div>
            </CardBody>
            <CardFooter className="justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button variant="secondary" loading={saving} onClick={() => handleCreate(false)}>
                Save Draft
              </Button>
              <Button loading={saving} onClick={() => handleCreate(true)}>
                Submit for Approval
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Inspection & Approval Modal */}
      {selectedMr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-xl shadow-overlay max-h-[90vh] overflow-y-auto">
            <CardHeader
              title={`${selectedMr.requestNumber} · ${selectedMr.project?.name}`}
              action={<StatusBadge status={selectedMr.status} />}
            />
            <CardBody className="space-y-4 text-xs">
              <div className="flex justify-between text-muted">
                <span>Requested by: <strong>{selectedMr.createdBy?.fullName}</strong></span>
                <span>Required by: <strong>{formatDate(selectedMr.requiredByDate)}</strong></span>
              </div>

              <table className="w-full text-left border border-line rounded">
                <thead className="bg-navy-50/50 border-b border-line uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {selectedMr.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 font-medium text-ink">{it.material?.name}</td>
                      <td className="px-3 py-2 text-right tabular font-bold">
                        {it.quantity} {it.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedMr.remarks && (
                <p className="rounded bg-navy-50/40 p-2.5 text-ink">
                  <strong>Remarks:</strong> {selectedMr.remarks}
                </p>
              )}

              {selectedMr.status === 'submitted' && (canApprove || canReject) && (
                <div className="border-t border-line pt-4 space-y-3">
                  <Input
                    size="sm"
                    placeholder="Rejection reason (required only if rejecting)..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    {canReject && (
                      <Button
                        variant="danger"
                        size="sm"
                        leftIcon={XCircle}
                        disabled={!rejectReason.trim()}
                        loading={actionLoading}
                        onClick={() => handleTransition(selectedMr.id, 'rejected', rejectReason)}
                      >
                        Reject
                      </Button>
                    )}
                    {canApprove && (
                      <Button
                        size="sm"
                        leftIcon={CheckCircle2}
                        loading={actionLoading}
                        onClick={() => handleTransition(selectedMr.id, 'approved')}
                      >
                        Approve MR
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {selectedMr.status === 'draft' && canCreate && (
                <div className="flex justify-end border-t border-line pt-3">
                  <Button
                    size="sm"
                    leftIcon={Send}
                    loading={actionLoading}
                    onClick={() => handleTransition(selectedMr.id, 'submitted')}
                  >
                    Submit for Approval
                  </Button>
                </div>
              )}
            </CardBody>
            <CardFooter className="justify-end">
              <Button variant="outline" onClick={() => setSelectedMr(null)}>
                Close
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      <Card>
        <TableToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search MR # or remarks...">
          <div className="w-full sm:w-52">
            <Select
              size="sm"
              value={projectFilter}
              options={[
                { value: '', label: 'All projects' },
                ...projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
              ]}
              onChange={(e) => setProjectFilter(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-40">
            <Select
              size="sm"
              value={statusFilter}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'draft', label: 'Draft' },
                { value: 'submitted', label: 'Submitted' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
              ]}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
          </div>
        </TableToolbar>

        <DataTable
          columns={columns}
          data={state.data}
          loading={state.loading}
          error={state.error}
          onRetry={load}
          emptyTitle="No material requests"
          emptyDescription="Raise material requests from construction sites to initiate procurement."
          onRowClick={(mr) => setSelectedMr(mr)}
          pagination={
            state.meta
              ? {
                  page: state.meta.page,
                  totalPages: state.meta.totalPages,
                  total: state.meta.total,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      </Card>
    </>
  );
}

