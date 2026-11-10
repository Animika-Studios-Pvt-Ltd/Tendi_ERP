import { AlertTriangle, ArrowLeftRight, Boxes, IndianRupee, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { useMasterData } from '@/hooks/useMasterData';
import { useWorkingProjectFilter } from '@/hooks/useWorkingProjectFilter';
import { inventoryService } from '@/services/inventory.service';
import { projectsService } from '@/services/projects.service';
import { formatCurrencyCompact, formatDate } from '@/utils/format';
import { TRANSACTION_TYPE_OPTIONS } from '../constants';

export default function StockOverviewPage() {
  const { can } = useAuth();
  const canCreate = can(MODULES.INVENTORY, ACTIONS.CREATE);
  const { materialCategories } = useMasterData();

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useWorkingProjectFilter();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const q = useDebouncedValue(search.trim());

  const [projects, setProjects] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [state, setState] = useState({ data: [], loading: true, error: null });

  // Movement Modal
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txProject, setTxProject] = useState('');
  const [txMaterial, setTxMaterial] = useState('');
  const [txType, setTxType] = useState('opening');
  const [txDirection, setTxDirection] = useState('increase');
  const [txQty, setTxQty] = useState('');
  const [txIssuedTo, setTxIssuedTo] = useState('');
  const [txRemarks, setTxRemarks] = useState('');
  const [txError, setTxError] = useState(null);
  const [txSaving, setTxSaving] = useState(false);

  // Transfer Modal
  const [transferOpen, setTransferOpen] = useState(false);
  const [fromProject, setFromProject] = useState('');
  const [toProject, setToProject] = useState('');
  const [transferMaterial, setTransferMaterial] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferRemarks, setTransferRemarks] = useState('');
  const [transferError, setTransferError] = useState(null);
  const [transferSaving, setTransferSaving] = useState(false);

  const loadLookups = useCallback(() => {
    projectsService
      .list({ limit: 100 })
      .then((pRes) => setProjects(pRes.data || []))
      .catch(() => {});
    inventoryService
      .listMaterials({ limit: 100, isActive: true })
      .then((mRes) => setMaterials(mRes.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await inventoryService.getStock({
        project: projectFilter || undefined,
        category: categoryFilter || undefined,
        lowStockOnly: lowStockOnly || undefined,
        q: q || undefined,
      });
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({ data: [], loading: false, error });
    }
  }, [projectFilter, categoryFilter, lowStockOnly, q]);

  useEffect(() => {
    load();
  }, [load]);

  const openMovementModal = (prefillRow = null) => {
    loadLookups();
    setTxProject(prefillRow?.project?.id || projectFilter || projects[0]?.id || '');
    setTxMaterial(prefillRow?.material?.id || materials[0]?.id || '');
    setTxType(prefillRow ? 'issue' : 'opening');
    setTxDirection('increase');
    setTxQty('');
    setTxIssuedTo('');
    setTxRemarks('');
    setTxError(null);
    setTxModalOpen(true);
  };

  const handleRecordTx = async (e) => {
    e.preventDefault();
    setTxError(null);
    setTxSaving(true);
    try {
      await inventoryService.recordTransaction({
        project: txProject,
        material: txMaterial,
        type: txType,
        direction: txType === 'adjustment' ? txDirection : undefined,
        quantity: Number(txQty),
        issuedTo: txIssuedTo,
        remarks: txRemarks,
      });
      setTxModalOpen(false);
      load();
    } catch (err) {
      setTxError(err.message || 'Failed to record stock movement');
    } finally {
      setTxSaving(false);
    }
  };

  const openTransferModal = () => {
    loadLookups();
    setFromProject(projectFilter || projects[0]?.id || '');
    setToProject(projects[1]?.id || '');
    setTransferMaterial(materials[0]?.id || '');
    setTransferQty('');
    setTransferRemarks('');
    setTransferError(null);
    setTransferOpen(true);
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setTransferError(null);
    setTransferSaving(true);
    try {
      await inventoryService.transferStock({
        fromProject,
        toProject,
        material: transferMaterial,
        quantity: Number(transferQty),
        remarks: transferRemarks,
      });
      setTransferOpen(false);
      load();
    } catch (err) {
      setTransferError(err.message || 'Transfer failed');
    } finally {
      setTransferSaving(false);
    }
  };

  // Summary Metrics
  const totalSkus = state.data.length;
  const lowStockCount = state.data.filter((d) => d.stockStatus === 'low_stock' || d.stockStatus === 'out_of_stock').length;
  const totalValue = state.data.reduce((sum, d) => sum + (d.stockValue || 0), 0);

  const columns = [
    {
      key: 'material',
      header: 'Material',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.material.name}</p>
          <p className="truncate text-xs text-muted font-mono">
            {row.material.code} · {row.material.category}
          </p>
        </div>
      ),
    },
    {
      key: 'project',
      header: 'Project / Store',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink">{row.project.name}</p>
          <p className="tabular text-[11px] text-muted">{row.project.code}</p>
        </div>
      ),
    },
    {
      key: 'currentStock',
      header: 'Available Stock',
      align: 'right',
      className: 'tabular font-bold text-ink',
      render: (row) => (
        <span>
          {row.currentStock} <span className="font-normal text-xs text-muted">{row.material.unit}</span>
        </span>
      ),
    },
    {
      key: 'reorderLevel',
      header: 'Reorder Level',
      align: 'right',
      className: 'tabular text-xs text-muted',
      render: (row) => `${row.material.reorderLevel} ${row.material.unit}`,
    },
    {
      key: 'stockValue',
      header: 'Est. Value',
      align: 'right',
      className: 'tabular text-xs font-medium text-ink',
      render: (row) => formatCurrencyCompact(row.stockValue),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.stockStatus} />,
    },
    {
      key: 'lastMovement',
      header: 'Last Movement',
      className: 'tabular whitespace-nowrap text-xs text-muted',
      render: (row) => formatDate(row.lastMovementAt),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        canCreate && (
          <Button variant="outline" size="sm" onClick={() => openMovementModal(row)}>
            Issue / Adjust
          </Button>
        ),
    },
  ];

  const headerActions = canCreate && (
    <div className="flex items-center gap-2">
      <Button variant="outline" leftIcon={ArrowLeftRight} onClick={openTransferModal}>
        Transfer stock
      </Button>
      <Button leftIcon={Plus} onClick={() => openMovementModal(null)}>
        Record movement
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Stock Overview"
        description="Real-time site & project stock balances computed from the inventory ledger."
        actions={headerActions}
      />

      {/* KPI Strip */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardBody className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-semibold text-muted uppercase">Tracked Stock Lines</p>
              <p className="mt-1 tabular text-2xl font-bold text-ink">{totalSkus}</p>
            </div>
            <div className="rounded-lg bg-navy-50 p-2.5 text-navy-700">
              <Boxes className="h-5 w-5" />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-semibold text-muted uppercase">Low / Out of Stock</p>
              <p className={`mt-1 tabular text-2xl font-bold ${lowStockCount > 0 ? 'text-warning-600' : 'text-ink'}`}>
                {lowStockCount}
              </p>
            </div>
            <div className={`rounded-lg p-2.5 ${lowStockCount > 0 ? 'bg-warning-50 text-warning-600' : 'bg-navy-50 text-navy-700'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-semibold text-muted uppercase">Total Valuation</p>
              <p className="mt-1 tabular text-2xl font-bold text-ink">{formatCurrencyCompact(totalValue)}</p>
            </div>
            <div className="rounded-lg bg-navy-50 p-2.5 text-navy-700">
              <IndianRupee className="h-5 w-5" />
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Record Movement Modal */}
      {txModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-md shadow-overlay">
            <CardHeader title="Record Stock Movement" />
            <form onSubmit={handleRecordTx}>
              <CardBody className="space-y-4">
                {txError && (
                  <div className="rounded border border-danger-200 bg-danger-50 p-2.5 text-xs text-danger-700">
                    {txError}
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Project *</label>
                  <Select
                    value={txProject}
                    onChange={(e) => setTxProject(e.target.value)}
                    placeholder={projects.length ? 'Select a project…' : 'No projects available'}
                    options={projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Material *</label>
                  <Select
                    value={txMaterial}
                    onChange={(e) => setTxMaterial(e.target.value)}
                    placeholder={materials.length ? 'Select a material…' : 'No materials found — add in Material Master'}
                    options={materials.map((m) => ({ value: m.id, label: `${m.code} - ${m.name} (${m.unit})` }))}
                    required
                  />
                  {materials.length === 0 && (
                    <p className="mt-1.5 text-xs text-warning-700">
                      No active materials in catalog yet.{' '}
                      <Link
                        to="/inventory/materials"
                        onClick={() => setTxModalOpen(false)}
                        className="font-semibold underline hover:text-warning-900"
                      >
                        Add materials in Material Master &rarr;
                      </Link>
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Movement Type *</label>
                    <Select
                      value={txType}
                      onChange={(e) => setTxType(e.target.value)}
                      options={TRANSACTION_TYPE_OPTIONS}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Quantity *</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={txQty}
                      onChange={(e) => setTxQty(e.target.value)}
                      required
                    />
                  </div>
                </div>
                {txType === 'adjustment' && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Adjustment Direction</label>
                    <Select
                      value={txDirection}
                      onChange={(e) => setTxDirection(e.target.value)}
                      options={[
                        { value: 'increase', label: 'Add to stock (+)' },
                        { value: 'decrease', label: 'Deduct from stock (-)' },
                      ]}
                    />
                  </div>
                )}
                {txType === 'issue' && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Issued To (Team / Zone)</label>
                    <Input
                      value={txIssuedTo}
                      onChange={(e) => setTxIssuedTo(e.target.value)}
                      placeholder="e.g. Tower A Masonry Team"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Remarks</label>
                  <Textarea
                    rows={2}
                    value={txRemarks}
                    onChange={(e) => setTxRemarks(e.target.value)}
                    placeholder="Reason or reference..."
                  />
                </div>
              </CardBody>
              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setTxModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={txSaving}>
                  Save transaction
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* Transfer Stock Modal */}
      {transferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-md shadow-overlay">
            <CardHeader title="Inter-Project Stock Transfer" />
            <form onSubmit={handleTransfer}>
              <CardBody className="space-y-4">
                {transferError && (
                  <div className="rounded border border-danger-200 bg-danger-50 p-2.5 text-xs text-danger-700">
                    {transferError}
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">From Project (Source) *</label>
                  <Select
                    value={fromProject}
                    onChange={(e) => setFromProject(e.target.value)}
                    placeholder="Select source project…"
                    options={projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">To Project (Destination) *</label>
                  <Select
                    value={toProject}
                    onChange={(e) => setToProject(e.target.value)}
                    placeholder="Select destination project…"
                    options={projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Material *</label>
                    <Select
                      value={transferMaterial}
                      onChange={(e) => setTransferMaterial(e.target.value)}
                      placeholder={materials.length ? 'Select material…' : 'No materials found'}
                      options={materials.map((m) => ({ value: m.id, label: `${m.code} - ${m.name}` }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Quantity *</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={transferQty}
                      onChange={(e) => setTransferQty(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Transfer Notes</label>
                  <Textarea
                    rows={2}
                    value={transferRemarks}
                    onChange={(e) => setTransferRemarks(e.target.value)}
                    placeholder="Vehicle #, gate pass, or reason..."
                  />
                </div>
              </CardBody>
              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={transferSaving}>
                  Execute transfer
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      <Card>
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search material code, name or project..."
        >
          <div className="w-full sm:w-48">
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
          <div className="w-full sm:w-44">
            <Select
              size="sm"
              value={categoryFilter}
              options={[
                { value: '', label: 'All categories' },
                ...materialCategories.map((c) => ({ value: c, label: c })),
              ]}
              onChange={(e) => setCategoryFilter(e.target.value)}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => setLowStockOnly(e.target.checked)}
              className="h-4 w-4 rounded border-line text-accent-600 focus:ring-accent-500"
            />
            Low stock only
          </label>
        </TableToolbar>

        <DataTable
          columns={columns}
          data={state.data}
          loading={state.loading}
          error={state.error}
          onRetry={load}
          emptyTitle="No stock balances yet"
          emptyDescription="Record an opening stock balance or goods receipt (GRN) to start tracking inventory."
        />
      </Card>
    </>
  );
}

