import { PackageCheck, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
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
import { procurementService } from '@/services/procurement.service';
import { projectsService } from '@/services/projects.service';
import { formatDate } from '@/utils/format';

const PAGE_SIZE = 20;

export default function GoodsReceiptsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = useAuth();
  const canCreate = can(MODULES.PROCUREMENT, ACTIONS.CREATE);

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useWorkingProjectFilter();
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim());

  const [projects, setProjects] = useState([]);
  const [openPos, setOpenPos] = useState([]);
  const [state, setState] = useState({ data: [], meta: null, loading: true, error: null });

  // Create GRN Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState('');
  const [challanNumber, setChallanNumber] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [receiveItems, setReceiveItems] = useState([]);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Detail modal
  const [selectedGrn, setSelectedGrn] = useState(null);

  const loadPosAndProjects = useCallback(async () => {
    try {
      const [pRes, poRes] = await Promise.all([
        projectsService.list({ limit: 100 }),
        procurementService.listPos({ status: 'approved', limit: 100 }),
      ]);
      setProjects(pRes.data || []);
      const pendingPos = (poRes.data || []).filter((po) => po.deliveryStatus !== 'fully_received');
      setOpenPos(pendingPos);

      const prefillPoId = searchParams.get('po');
      if (prefillPoId && pendingPos.some((p) => p.id === prefillPoId)) {
        openGrnModalForPo(prefillPoId, pendingPos);
        setSearchParams({}, { replace: true });
      }
    } catch {
      // ignore
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    loadPosAndProjects();
  }, [loadPosAndProjects]);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, meta } = await procurementService.listGrns({
        q: q || undefined,
        project: projectFilter || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setState({ data, meta, loading: false, error: null });
    } catch (error) {
      setState({ data: [], meta: null, loading: false, error });
    }
  }, [q, projectFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setPage(1), [q, projectFilter]);

  const openGrnModalForPo = (poId, poList = openPos) => {
    setSelectedPoId(poId);
    setChallanNumber('');
    setReceivedDate(new Date().toISOString().slice(0, 10));
    setRemarks('');
    setFormError(null);

    const po = poList.find((p) => p.id === poId);
    if (po) {
      setReceiveItems(
        po.items
          .map((it) => {
            const remaining = Math.max(0, it.quantity - (it.receivedQuantity || 0));
            return {
              material: it.material?.id,
              name: it.material?.name,
              unit: it.unit,
              ordered: it.quantity,
              alreadyReceived: it.receivedQuantity || 0,
              remaining,
              receivedQuantity: String(remaining),
            };
          })
          .filter((it) => it.remaining > 0),
      );
    } else {
      setReceiveItems([]);
    }
    setModalOpen(true);
  };

  const handlePoChange = (poId) => {
    openGrnModalForPo(poId, openPos);
  };

  const handleCreateGrn = async (e) => {
    e.preventDefault();
    setFormError(null);

    const validItems = receiveItems
      .filter((it) => Number(it.receivedQuantity) > 0)
      .map((it) => ({
        material: it.material,
        receivedQuantity: Number(it.receivedQuantity),
      }));

    if (!selectedPoId || validItems.length === 0) {
      setFormError('Select a Purchase Order and enter received quantities > 0.');
      return;
    }

    setSaving(true);
    try {
      await procurementService.createGrn({
        purchaseOrder: selectedPoId,
        challanNumber: challanNumber.trim(),
        receivedDate,
        remarks: remarks.trim(),
        items: validItems,
      });
      setModalOpen(false);
      load();
      loadPosAndProjects();
    } catch (err) {
      setFormError(err.message || 'Failed to record goods receipt');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: 'grnNumber',
      header: 'GRN #',
      render: (g) => (
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-ink">{g.grnNumber}</p>
          <p className="tabular text-[11px] text-muted">{formatDate(g.receivedDate)}</p>
        </div>
      ),
    },
    {
      key: 'po',
      header: 'PO & Vendor',
      render: (g) => (
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium text-ink">{g.purchaseOrder?.poNumber || '—'}</p>
          <p className="truncate text-[11px] text-muted">{g.vendor?.name || '—'}</p>
        </div>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      render: (g) => <span className="text-xs text-ink">{g.project?.code} · {g.project?.name}</span>,
    },
    {
      key: 'items',
      header: 'Items Received',
      render: (g) => (
        <Badge tone="success">
          {g.items?.length} {g.items?.length === 1 ? 'material' : 'materials'} stocked
        </Badge>
      ),
    },
    {
      key: 'challan',
      header: 'Challan #',
      className: 'font-mono text-xs text-muted',
      render: (g) => g.challanNumber || '—',
    },
    {
      key: 'receivedBy',
      header: 'Received By',
      className: 'text-xs text-muted',
      render: (g) => g.receivedBy?.fullName || '—',
    },
  ];

  return (
    <>
      <PageHeader
        title="Goods Receipt Notes (GRN)"
        description="Log site material deliveries against approved Purchase Orders; inventory stock updates automatically."
        actions={
          canCreate && (
            <Button
              leftIcon={Plus}
              onClick={() => openGrnModalForPo(openPos[0]?.id || '', openPos)}
            >
              Record goods receipt
            </Button>
          )
        }
      />

      {/* Create GRN Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-2xl shadow-overlay max-h-[90vh] overflow-y-auto">
            <CardHeader title="Record Goods Receipt (GRN)" />
            <form onSubmit={handleCreateGrn}>
              <CardBody className="space-y-4">
                {formError && (
                  <div className="rounded border border-danger-200 bg-danger-50 p-2.5 text-xs text-danger-700">
                    {formError}
                  </div>
                )}

                {openPos.length === 0 ? (
                  <p className="text-xs text-muted">
                    No approved Purchase Orders with pending deliveries found. Approve a Purchase Order first.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-semibold text-ink">Approved Purchase Order *</label>
                        <Select
                          value={selectedPoId}
                          onChange={(e) => handlePoChange(e.target.value)}
                          options={openPos.map((po) => ({
                            value: po.id,
                            label: `${po.poNumber} · ${po.vendor?.name} (${po.project?.code})`,
                          }))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-ink">Delivery Challan #</label>
                        <Input
                          value={challanNumber}
                          onChange={(e) => setChallanNumber(e.target.value)}
                          placeholder="e.g. DC-4402"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink">Received Date</label>
                      <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
                    </div>

                    {receiveItems.length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-ink">Quantities Received</label>
                        <table className="w-full text-left text-xs border border-line rounded">
                          <thead className="bg-navy-50/50 border-b border-line uppercase text-muted">
                            <tr>
                              <th className="px-3 py-2">Material</th>
                              <th className="px-3 py-2 text-right">Ordered</th>
                              <th className="px-3 py-2 text-right">Remaining</th>
                              <th className="px-3 py-2 text-right">Receiving Now</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {receiveItems.map((it, idx) => (
                              <tr key={it.material}>
                                <td className="px-3 py-2 font-medium text-ink">{it.name}</td>
                                <td className="px-3 py-2 text-right tabular text-muted">
                                  {it.ordered} {it.unit}
                                </td>
                                <td className="px-3 py-2 text-right tabular font-semibold">
                                  {it.remaining} {it.unit}
                                </td>
                                <td className="px-3 py-2 w-32">
                                  <Input
                                    size="sm"
                                    type="number"
                                    min="0"
                                    max={it.remaining}
                                    step="0.01"
                                    value={it.receivedQuantity}
                                    onChange={(e) =>
                                      setReceiveItems((prev) =>
                                        prev.map((row, i) =>
                                          i === idx ? { ...row, receivedQuantity: e.target.value } : row,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink">Inspection / Receipt Remarks</label>
                      <Textarea
                        rows={2}
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="Condition of materials, truck #, weighbridge slip..."
                      />
                    </div>
                  </>
                )}
              </CardBody>
              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                {openPos.length > 0 && (
                  <Button type="submit" leftIcon={PackageCheck} loading={saving}>
                    Confirm Receipt & Update Stock
                  </Button>
                )}
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* View GRN Modal */}
      {selectedGrn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-lg shadow-overlay">
            <CardHeader title={`${selectedGrn.grnNumber} · ${selectedGrn.vendor?.name}`} />
            <CardBody className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2 text-muted">
                <div>PO: <strong className="font-mono text-ink">{selectedGrn.purchaseOrder?.poNumber}</strong></div>
                <div>Date: <strong className="text-ink">{formatDate(selectedGrn.receivedDate)}</strong></div>
                <div>Challan #: <strong className="text-ink">{selectedGrn.challanNumber || '—'}</strong></div>
                <div>Received by: <strong className="text-ink">{selectedGrn.receivedBy?.fullName}</strong></div>
              </div>
              <table className="w-full text-left border border-line rounded">
                <thead className="bg-navy-50/50 border-b border-line uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2 text-right">Received Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {selectedGrn.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 font-medium text-ink">{it.material?.name}</td>
                      <td className="px-3 py-2 text-right tabular font-bold text-success-700">
                        +{it.receivedQuantity} {it.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selectedGrn.remarks && (
                <p className="rounded bg-navy-50/40 p-2.5 text-ink">
                  <strong>Remarks:</strong> {selectedGrn.remarks}
                </p>
              )}
            </CardBody>
            <CardFooter className="justify-end">
              <Button variant="outline" onClick={() => setSelectedGrn(null)}>Close</Button>
            </CardFooter>
          </Card>
        </div>
      )}

      <Card>
        <TableToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search GRN #, challan # or remarks...">
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
        </TableToolbar>

        <DataTable
          columns={columns}
          data={state.data}
          loading={state.loading}
          error={state.error}
          onRetry={load}
          emptyTitle="No goods receipts logged"
          emptyDescription="Receive deliveries against approved Purchase Orders to automatically credit inventory stock."
          onRowClick={(g) => setSelectedGrn(g)}
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

