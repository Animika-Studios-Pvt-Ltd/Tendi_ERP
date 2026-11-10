import { Edit3, Package, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
import { useMasterData } from '@/hooks/useMasterData';
import { inventoryService } from '@/services/inventory.service';
import { formatCurrencyCompact } from '@/utils/format';

const PAGE_SIZE = 25;

export default function MaterialsListPage() {
  const { can } = useAuth();
  const canCreate = can(MODULES.INVENTORY, ACTIONS.CREATE);
  const canUpdate = can(MODULES.INVENTORY, ACTIONS.UPDATE);
  const canDelete = can(MODULES.INVENTORY, ACTIONS.DELETE);
  const { materialCategories, units } = useMasterData();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim());

  const [state, setState] = useState({ data: [], meta: null, loading: true, error: null });

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [standardRate, setStandardRate] = useState('0');
  const [reorderLevel, setReorderLevel] = useState('10');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, meta } = await inventoryService.listMaterials({
        q: q || undefined,
        category: categoryFilter || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setState({ data, meta, loading: false, error: null });
    } catch (error) {
      setState({ data: [], meta: null, loading: false, error });
    }
  }, [q, categoryFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setPage(1), [q, categoryFilter]);

  const openCreateModal = () => {
    setEditing(null);
    setCode('');
    setName('');
    setCategory(materialCategories[0] || '');
    setUnit(units[0] || '');
    setHsnCode('');
    setStandardRate('0');
    setReorderLevel('10');
    setDescription('');
    setIsActive(true);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (m) => {
    setEditing(m);
    setCode(m.code);
    setName(m.name);
    setCategory(m.category);
    setUnit(m.unit);
    setHsnCode(m.hsnCode || '');
    setStandardRate(String(m.standardRate ?? 0));
    setReorderLevel(String(m.reorderLevel ?? 10));
    setDescription(m.description || '');
    setIsActive(m.isActive ?? true);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        category,
        unit,
        hsnCode: hsnCode.trim(),
        standardRate: Number(standardRate) || 0,
        reorderLevel: Number(reorderLevel) || 0,
        description: description.trim(),
        isActive,
      };

      if (editing) {
        const { code: _, ...updatePayload } = payload;
        await inventoryService.updateMaterial(editing.id, updatePayload);
      } else {
        await inventoryService.createMaterial(payload);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setFormError(err.message || 'Failed to save material');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m) => {
    if (!canDelete) return;
    if (!window.confirm(`Delete material ${m.code} (${m.name})?`)) return;
    try {
      await inventoryService.deleteMaterial(m.id);
      load();
    } catch (err) {
      alert(err.message || 'Cannot delete material');
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Material',
      render: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{m.name}</p>
          <p className="truncate text-xs text-muted font-mono">
            {m.code}
            {m.hsnCode ? ` · HSN: ${m.hsnCode}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (m) => <Badge tone="neutral">{m.category}</Badge>,
    },
    {
      key: 'unit',
      header: 'Unit',
      className: 'text-xs font-medium text-ink',
      render: (m) => m.unit,
    },
    {
      key: 'standardRate',
      header: 'Std. Rate',
      align: 'right',
      className: 'tabular text-xs font-medium text-ink',
      render: (m) => (m.standardRate ? formatCurrencyCompact(m.standardRate) : '—'),
    },
    {
      key: 'reorderLevel',
      header: 'Reorder Level',
      align: 'right',
      className: 'tabular text-xs text-muted',
      render: (m) => `${m.reorderLevel} ${m.unit}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (m) => (
        <Badge tone={m.isActive ? 'success' : 'neutral'}>{m.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canUpdate && (
            <Button variant="ghost" size="sm" onClick={() => openEditModal(m)}>
              <Edit3 className="h-4 w-4 text-muted hover:text-ink" />
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" onClick={() => handleDelete(m)}>
              <Trash2 className="h-4 w-4 text-muted hover:text-danger-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const addButton = canCreate && (
    <Button leftIcon={Plus} onClick={openCreateModal}>
      New material
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Material Master"
        description="Central catalog of construction materials, units of measure, standard rates and reorder thresholds."
        actions={addButton}
      />

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-lg shadow-overlay max-h-[90vh] overflow-y-auto">
            <CardHeader title={editing ? `Edit Material (${editing.code})` : 'Add New Material'} />
            <form onSubmit={handleSave}>
              <CardBody className="space-y-4">
                {formError && (
                  <div className="rounded border border-danger-200 bg-danger-50 p-2.5 text-xs text-danger-700">
                    {formError}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Material Code *</label>
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="e.g. MAT-CEM-01"
                      className="font-mono uppercase"
                      disabled={Boolean(editing)}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">HSN Code</label>
                    <Input
                      value={hsnCode}
                      onChange={(e) => setHsnCode(e.target.value)}
                      placeholder="e.g. 2523"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Material Name *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. UltraTech PPC Cement 50kg"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Category *</label>
                    <Select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      options={materialCategories.map((c) => ({ value: c, label: c }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Unit *</label>
                    <Select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      options={units.map((u) => ({ value: u, label: u }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Standard Rate (INR)</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={standardRate}
                      onChange={(e) => setStandardRate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Reorder Level</label>
                    <Input
                      type="number"
                      min="0"
                      value={reorderLevel}
                      onChange={(e) => setReorderLevel(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Description</label>
                  <Textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Grade, specs or packaging notes..."
                  />
                </div>
                {editing && (
                  <label className="flex items-center gap-2 text-xs font-medium text-ink">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="h-4 w-4 rounded border-line text-accent-600 focus:ring-accent-500"
                    />
                    Material is active
                  </label>
                )}
              </CardBody>
              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving}>
                  {editing ? 'Save changes' : 'Create material'}
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
          searchPlaceholder="Search material code, name or HSN..."
        >
          <div className="w-full sm:w-48">
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
        </TableToolbar>
        <DataTable
          columns={columns}
          data={state.data}
          loading={state.loading}
          error={state.error}
          onRetry={load}
          emptyTitle="No materials defined"
          emptyDescription="Add materials to your catalog to start tracking inventory and procurement."
          onRowClick={(m) => canUpdate && openEditModal(m)}
          pagination={
            state.meta
              ? {
                  page: state.meta.page,
                  limit: state.meta.limit ?? PAGE_SIZE,
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

