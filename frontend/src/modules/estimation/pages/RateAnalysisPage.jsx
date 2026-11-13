import { Layers, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/tables/DataTable';
import PageHeader from '@/components/common/PageHeader';
import TableToolbar from '@/components/tables/TableToolbar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useMasterData } from '@/hooks/useMasterData';
import { estimationService } from '@/services/estimation.service';
import { inventoryService } from '@/services/inventory.service';
import { formatCurrencyCompact } from '@/utils/format';

export default function RateAnalysisPage() {
  const { can } = useAuth();
  const canCreate = can(MODULES.ESTIMATION, ACTIONS.CREATE);
  const canDelete = can(MODULES.ESTIMATION, ACTIONS.DELETE);
  const { units, costHeads } = useMasterData();

  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [state, setState] = useState({ items: [], loading: true, error: null });
  const [materials, setMaterials] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [form, setForm] = useState({
    name: '',
    costHead: 'Superstructure & RCC',
    unit: 'cu.m',
    overheadPercent: '10',
    materialId: '',
    materialDesc: '',
    materialQty: '1',
    materialRate: '',
    labourTrade: 'Mason Crew',
    labourQty: '0.5',
    labourRate: '950',
    equipName: 'Concrete Mixer / Pump',
    equipQty: '0.25',
    equipRate: '700',
  });

  useEffect(() => {
    inventoryService
      .listMaterials({ limit: 100, isActive: 'true' })
      .then(({ data }) => setMaterials(data || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await estimationService.listRateAnalyses({ limit: 100, ...(debouncedQ ? { q: debouncedQ } : {}) });
      setState({ items: res.data || [], loading: false, error: null });
    } catch (error) {
      setState({ items: [], loading: false, error });
    }
  }, [debouncedQ]);

  useEffect(() => {
    load();
  }, [load]);

  const handleMaterialPick = (materialId) => {
    const mat = materials.find((m) => m.id === materialId);
    setForm((prev) => ({
      ...prev,
      materialId,
      materialDesc: mat ? mat.name : prev.materialDesc,
      materialRate: mat ? String(mat.standardRate ?? 0) : prev.materialRate,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        costHead: form.costHead,
        unit: form.unit,
        overheadPercent: Number(form.overheadPercent || 0),
        materialComponents: form.materialDesc.trim()
          ? [
              {
                material: form.materialId || null,
                description: form.materialDesc.trim(),
                unit: form.unit,
                qtyPerUnit: Number(form.materialQty || 0),
                rate: Number(form.materialRate || 0),
              },
            ]
          : [],
        labourComponents: form.labourTrade.trim()
          ? [{ trade: form.labourTrade.trim(), unit: 'days', qtyPerUnit: Number(form.labourQty || 0), rate: Number(form.labourRate || 0) }]
          : [],
        equipmentComponents: form.equipName.trim()
          ? [{ equipmentName: form.equipName.trim(), unit: 'hours', qtyPerUnit: Number(form.equipQty || 0), rate: Number(form.equipRate || 0) }]
          : [],
      };
      await estimationService.createRateAnalysis(payload);
      setModalOpen(false);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: 'code',
      header: 'Code & Work Item',
      render: (r) => (
        <div>
          <span className="font-mono text-xs font-semibold text-ink">{r.code}</span>
          <p className="font-medium text-ink">{r.name}</p>
        </div>
      ),
    },
    { key: 'costHead', header: 'Cost Head', render: (r) => <Badge tone="neutral">{r.costHead}</Badge> },
    { key: 'unit', header: 'Unit', render: (r) => <span className="text-xs text-muted">{r.unit}</span> },
    { key: 'materialUnitCost', header: 'Material', align: 'right', render: (r) => <span className="tabular-nums text-xs">{formatCurrencyCompact(r.materialUnitCost)}</span> },
    { key: 'labourUnitCost', header: 'Labour', align: 'right', render: (r) => <span className="tabular-nums text-xs">{formatCurrencyCompact(r.labourUnitCost)}</span> },
    { key: 'equipmentUnitCost', header: 'Equip.', align: 'right', render: (r) => <span className="tabular-nums text-xs">{formatCurrencyCompact(r.equipmentUnitCost)}</span> },
    { key: 'directRate', header: 'Direct Rate', align: 'right', render: (r) => <span className="tabular-nums text-xs font-medium">{formatCurrencyCompact(r.directRate)}</span> },
    {
      key: 'compositeRate',
      header: 'Composite (+OH)',
      align: 'right',
      render: (r) => <span className="font-semibold tabular-nums text-ink">{formatCurrencyCompact(r.compositeRate)}</span>,
    },
    ...(canDelete
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <Button
                size="sm"
                variant="ghost"
                onClick={async (e) => {
                  e.stopPropagation();
                  await estimationService.deleteRateAnalysis(r.id);
                  load();
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rate Analysis Library"
        description="Standard composite unit rates combining materials, labour norms, equipment, and overhead."
        actions={
          canCreate && (
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" /> New rate template
            </Button>
          )
        }
      />

      <Card>
        <TableToolbar search={q} onSearchChange={setQ} searchPlaceholder="Search rate analyses by code, work item, or cost head…" />

        <DataTable
          columns={columns}
          data={state.items}
          loading={state.loading}
          error={state.error}
          onRetry={load}
          emptyTitle="No rate analyses configured"
          emptyDescription="Create reusable unit-rate norms to standardize BOQ pricing across estimates."
        />
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <form onSubmit={handleSave}>
              <CardHeader title="Create Composite Rate Analysis" description="Material rates pull dynamically from Inventory Material Master when linked." />
              <CardBody className="space-y-3">
                {formError && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-ink">Work Item Name *</label>
                    <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. M25 RCC Slab Pouring & Compaction" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Cost Head</label>
                    <Select value={form.costHead} onChange={(e) => setForm({ ...form, costHead: e.target.value })} options={costHeads.map((c) => ({ value: c, label: c }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-ink">Unit *</label>
                      <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} options={units.map((u) => ({ value: u, label: u }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-ink">Overhead %</label>
                      <Input type="number" step="0.5" value={form.overheadPercent} onChange={(e) => setForm({ ...form, overheadPercent: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink"><Layers className="h-3.5 w-3.5" /> Primary Material Component</p>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <div className="sm:col-span-2">
                      <Select
                        value={form.materialId}
                        onChange={(e) => handleMaterialPick(e.target.value)}
                        placeholder="Optional Material Catalog…"
                        options={materials.map((m) => ({ value: m.id, label: `${m.code} · ${m.name}` }))}
                      />
                    </div>
                    <Input placeholder="Qty/unit" type="number" step="0.01" value={form.materialQty} onChange={(e) => setForm({ ...form, materialQty: e.target.value })} />
                    <Input placeholder="Rate (₹)" type="number" step="0.01" value={form.materialRate} onChange={(e) => setForm({ ...form, materialRate: e.target.value })} />
                  </div>
                  <Input placeholder="Material description" value={form.materialDesc} onChange={(e) => setForm({ ...form, materialDesc: e.target.value })} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <p className="text-xs font-semibold text-ink">Labour Norm</p>
                    <Input placeholder="Trade" value={form.labourTrade} onChange={(e) => setForm({ ...form, labourTrade: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Days/unit" type="number" step="0.01" value={form.labourQty} onChange={(e) => setForm({ ...form, labourQty: e.target.value })} />
                      <Input placeholder="Rate/day" type="number" step="0.01" value={form.labourRate} onChange={(e) => setForm({ ...form, labourRate: e.target.value })} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <p className="text-xs font-semibold text-ink">Equipment Norm</p>
                    <Input placeholder="Equipment" value={form.equipName} onChange={(e) => setForm({ ...form, equipName: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Hrs/unit" type="number" step="0.01" value={form.equipQty} onChange={(e) => setForm({ ...form, equipQty: e.target.value })} />
                      <Input placeholder="Rate/hr" type="number" step="0.01" value={form.equipRate} onChange={(e) => setForm({ ...form, equipRate: e.target.value })} />
                    </div>
                  </div>
                </div>
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Rate Analysis'}</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
