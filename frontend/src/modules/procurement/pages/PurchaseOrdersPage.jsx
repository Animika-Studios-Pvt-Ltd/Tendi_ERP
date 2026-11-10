import { CheckCircle2, PackageCheck, Plus, Send, Trash2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import DataTable from '@/components/tables/DataTable';
import TableToolbar from '@/components/tables/TableToolbar';
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
import { formatCurrencyCompact, formatDate } from '@/utils/format';

const PAGE_SIZE = 20;

export default function PurchaseOrdersPage() {
  const navigate = useNavigate();
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
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [approvedMrs, setApprovedMrs] = useState([]);
  const [state, setState] = useState({ data: [], meta: null, loading: true, error: null });

  // Create Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [poProject, setPoProject] = useState('');
  const [poVendor, setPoVendor] = useState('');
  const [poMr, setPoMr] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [terms, setTerms] = useState('Standard delivery to site store within 7 days.');
  const [poItems, setPoItems] = useState([]);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Detail / Approval Modal
  const [selectedPo, setSelectedPo] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      projectsService.list({ limit: 100 }),
      procurementService.listVendors({ limit: 100, isActive: true }),
      inventoryService.listMaterials({ limit: 100, isActive: true }),
      procurementService.listRequests({ status: 'approved', limit: 100 }),
    ])
      .then(([pRes, vRes, mRes, mrRes]) => {
        setProjects(pRes.data || []);
        setVendors(vRes.data || []);
        setMaterials(mRes.data || []);
        setApprovedMrs(mrRes.data || []);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, meta } = await procurementService.listPos({
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
    setPoProject(projectFilter || projects[0]?.id || '');
    setPoVendor(vendors[0]?.id || '');
    setPoMr('');
    setExpectedDate('');
    const mat = materials[0];
    setPoItems([
      {
        material: mat?.id || '',
        quantity: '10',
        unit: mat?.unit || 'bags',
        unitRate: String(mat?.standardRate || 0),
        taxPercent: '18',
      },
    ]);
    setFormError(null);
    setCreateOpen(true);
  };

  const handleSelectMr = (mrId) => {
    setPoMr(mrId);
    if (!mrId) return;
    const mr = approvedMrs.find((m) => m.id === mrId);
    if (mr) {
      setPoProject(mr.project?.id || poProject);
      setPoItems(
        mr.items.map((it) => {
          const mat = materials.find((m) => m.id === it.material?.id);
          return {
            material: it.material?.id || '',
            quantity: String(it.quantity),
            unit: it.unit,
            unitRate: String(mat?.standardRate || 0),
            taxPercent: '18',
          };
        }),
      );
    }
  };

  const updateItemRow = (idx, field, value) => {
    setPoItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        if (field === 'material') {
          const mat = materials.find((m) => m.id === value);
          return {
            ...row,
            material: value,
            unit: mat?.unit || row.unit,
            unitRate: String(mat?.standardRate ?? row.unitRate),
          };
        }
        return { ...row, [field]: value };
      }),
    );
  };

  const computeLiveTotals = () => {
    let subtotal = 0;
    let taxTotal = 0;
    for (const row of poItems) {
      const base = (Number(row.quantity) || 0) * (Number(row.unitRate) || 0);
      const tax = base * ((Number(row.taxPercent) || 0) / 100);
      subtotal += base;
      taxTotal += tax;
    }
    return { subtotal, taxTotal, grandTotal: subtotal + taxTotal };
  };

  const handleCreate = async (submitImmediately = false) => {
    setFormError(null);
    const validItems = poItems.filter((i) => i.material && Number(i.quantity) > 0);
    if (!poProject || !poVendor || validItems.length === 0) {
      setFormError('Select project, vendor, and at least one item.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await procurementService.createPo({
        project: poProject,
        vendor: poVendor,
        materialRequest: poMr || null,
        expectedDeliveryDate: expectedDate || undefined,
        termsAndConditions: terms,
        items: validItems.map((i) => ({
          material: i.material,
          quantity: Number(i.quantity),
          unit: i.unit,
          unitRate: Number(i.unitRate) || 0,
          taxPercent: Number(i.taxPercent) || 0,
        })),
      });
      if (submitImmediately) {
        await procurementService.transitionPo(data.id, { status: 'submitted' });
      }
      setCreateOpen(false);
      load();
    } catch (err) {
      setFormError(err.message || 'Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  };

  const handleTransition = async (poId, status, comment) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const { data } = await procurementService.transitionPo(poId, { status, comment });
      setSelectedPo(data);
      setRejectReason('');
      load();
    } catch (err) {
      setActionError(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      key: 'poNumber',
      header: 'PO #',
      render: (po) => (
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-ink">{po.poNumber}</p>
          <p className="tabular text-[11px] text-muted">{formatDate(po.poDate)}</p>
        </div>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendor & Project',
      render: (po) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink">{po.vendor?.name || '—'}</p>
          <p className="truncate text-[11px] text-muted">{po.project?.code} · {po.project?.name}</p>
        </div>
      ),
    },
    {
      key: 'grandTotal',
      header: 'Grand Total',
      align: 'right',
      className: 'tabular font-bold text-xs text-ink',
      render: (po) => formatCurrencyCompact(po.grandTotal),
    },
    {
      key: 'status',
      header: 'Approval',
      render: (po) => <StatusBadge status={po.status} />,
    },
    {
      key: 'delivery',
      header: 'Delivery',
      render: (po) => <StatusBadge status={po.deliveryStatus} />,
    },
  ];

  const liveTotals = computeLiveTotals();

  return (
    <>
      <PageHeader
        title="Purchase Orders (PO)"
        description="Vendor orders with GST calculation, approval limit enforcement, and delivery tracking."
        actions={
          canCreate && (
            <Button leftIcon={Plus} onClick={openCreate}>
              New purchase order
            </Button>
          )
        }
      />

      {/* Create PO Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-3xl shadow-overlay max-h-[90vh] overflow-y-auto">
            <CardHeader title="Create Purchase Order" />
            <CardBody className="space-y-4">
              {formError && (
                <div className="rounded border border-danger-200 bg-danger-50 p-2.5 text-xs text-danger-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Link Material Request (optional)</label>
                  <Select
                    value={poMr}
                    onChange={(e) => handleSelectMr(e.target.value)}
                    options={[
                      { value: '', label: 'Direct PO (No MR)' },
                      ...approvedMrs.map((m) => ({
                        value: m.id,
                        label: `${m.requestNumber} (${m.project?.code})`,
                      })),
                    ]}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Project *</label>
                  <Select
                    value={poProject}
                    onChange={(e) => setPoProject(e.target.value)}
                    options={projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Vendor *</label>
                  <Select
                    value={poVendor}
                    onChange={(e) => setPoVendor(e.target.value)}
                    options={vendors.map((v) => ({ value: v.id, label: `${v.code} - ${v.name}` }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink">Order Line Items *</label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    leftIcon={Plus}
                    onClick={() =>
                      setPoItems((prev) => [
                        ...prev,
                        { material: materials[0]?.id || '', quantity: '1', unit: materials[0]?.unit || 'bags', unitRate: '0', taxPercent: '18' },
                      ])
                    }
                  >
                    Add item
                  </Button>
                </div>

                {poItems.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 items-center gap-2">
                    <div className="col-span-4">
                      <Select
                        size="sm"
                        value={row.material}
                        onChange={(e) => updateItemRow(idx, 'material', e.target.value)}
                        options={materials.map((m) => ({ value: m.id, label: `${m.code} - ${m.name}` }))}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        size="sm"
                        type="number"
                        placeholder="Qty"
                        value={row.quantity}
                        onChange={(e) => updateItemRow(idx, 'quantity', e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 text-center text-xs text-muted">{row.unit}</div>
                    <div className="col-span-2">
                      <Input
                        size="sm"
                        type="number"
                        placeholder="Rate"
                        value={row.unitRate}
                        onChange={(e) => updateItemRow(idx, 'unitRate', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        size="sm"
                        type="number"
                        placeholder="Tax%"
                        value={row.taxPercent}
                        onChange={(e) => updateItemRow(idx, 'taxPercent', e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={poItems.length <= 1}
                        onClick={() => setPoItems((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4 text-muted hover:text-danger-600" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end rounded-md bg-navy-50/50 p-3 text-xs space-x-6">
                <div>
                  <span className="text-muted">Subtotal:</span>{' '}
                  <strong className="tabular text-ink">{formatCurrencyCompact(liveTotals.subtotal)}</strong>
                </div>
                <div>
                  <span className="text-muted">GST:</span>{' '}
                  <strong className="tabular text-ink">{formatCurrencyCompact(liveTotals.taxTotal)}</strong>
                </div>
                <div>
                  <span className="text-muted">Grand Total:</span>{' '}
                  <strong className="tabular text-navy-900 text-sm">{formatCurrencyCompact(liveTotals.grandTotal)}</strong>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Terms & Conditions</label>
                <Textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} />
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
                Submit PO for Approval
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Detail / Approval Modal */}
      {selectedPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-2xl shadow-overlay max-h-[90vh] overflow-y-auto">
            <CardHeader
              title={`${selectedPo.poNumber} · ${selectedPo.vendor?.name}`}
              action={<StatusBadge status={selectedPo.status} />}
            />
            <CardBody className="space-y-4 text-xs">
              {actionError && (
                <div className="rounded border border-danger-200 bg-danger-50 p-2.5 text-xs text-danger-700">
                  {actionError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-muted">
                <div>Project: <strong className="text-ink">{selectedPo.project?.code} - {selectedPo.project?.name}</strong></div>
                <div>Delivery: <StatusBadge status={selectedPo.deliveryStatus} /></div>
              </div>

              <table className="w-full text-left border border-line rounded">
                <thead className="bg-navy-50/50 border-b border-line uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2 text-right">Ordered</th>
                    <th className="px-3 py-2 text-right">Received</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {selectedPo.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 font-medium text-ink">{it.material?.name}</td>
                      <td className="px-3 py-2 text-right tabular">{it.quantity} {it.unit}</td>
                      <td className="px-3 py-2 text-right tabular font-semibold text-accent-700">
                        {it.receivedQuantity} {it.unit}
                      </td>
                      <td className="px-3 py-2 text-right tabular">{formatCurrencyCompact(it.unitRate)}</td>
                      <td className="px-3 py-2 text-right tabular font-bold">{formatCurrencyCompact(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end space-x-4 font-semibold text-ink">
                <span>Subtotal: {formatCurrencyCompact(selectedPo.subtotal)}</span>
                <span>Tax: {formatCurrencyCompact(selectedPo.taxTotal)}</span>
                <span className="text-sm font-bold text-navy-900">Grand Total: {formatCurrencyCompact(selectedPo.grandTotal)}</span>
              </div>

              {selectedPo.status === 'submitted' && (canApprove || canReject) && (
                <div className="border-t border-line pt-4 space-y-3">
                  <Input
                    size="sm"
                    placeholder="Rejection reason (required if rejecting)..."
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
                        onClick={() => handleTransition(selectedPo.id, 'rejected', rejectReason)}
                      >
                        Reject PO
                      </Button>
                    )}
                    {canApprove && (
                      <Button
                        size="sm"
                        leftIcon={CheckCircle2}
                        loading={actionLoading}
                        onClick={() => handleTransition(selectedPo.id, 'approved')}
                      >
                        Approve PO
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {selectedPo.status === 'draft' && canCreate && (
                <div className="flex justify-end border-t border-line pt-3">
                  <Button
                    size="sm"
                    leftIcon={Send}
                    loading={actionLoading}
                    onClick={() => handleTransition(selectedPo.id, 'submitted')}
                  >
                    Submit for Approval
                  </Button>
                </div>
              )}
            </CardBody>
            <CardFooter className="justify-between">
              <div>
                {selectedPo.status === 'approved' && selectedPo.deliveryStatus !== 'fully_received' && (
                  <Button
                    size="sm"
                    leftIcon={PackageCheck}
                    onClick={() => navigate(`/procurement/goods-receipts?po=${selectedPo.id}`)}
                  >
                    Record Goods Receipt (GRN)
                  </Button>
                )}
              </div>
              <Button variant="outline" onClick={() => { setSelectedPo(null); setActionError(null); }}>
                Close
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      <Card>
        <TableToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search PO # or terms...">
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
          emptyTitle="No purchase orders"
          emptyDescription="Create purchase orders for vendors against approved material requests."
          onRowClick={(po) => { setActionError(null); setSelectedPo(po); }}
          pagination={
            state.meta
              ? { page: state.meta.page, totalPages: state.meta.totalPages, total: state.meta.total, onPageChange: setPage }
              : undefined
          }
        />
      </Card>
    </>
  );
}

