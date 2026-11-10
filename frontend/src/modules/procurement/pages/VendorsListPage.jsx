import { Edit3, Plus, Star, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/tables/DataTable';
import TableToolbar from '@/components/tables/TableToolbar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { procurementService } from '@/services/procurement.service';

const PAGE_SIZE = 20;

export default function VendorsListPage() {
  const { can } = useAuth();
  const canCreate = can(MODULES.PROCUREMENT, ACTIONS.CREATE);
  const canUpdate = can(MODULES.PROCUREMENT, ACTIONS.UPDATE);
  const canDelete = can(MODULES.PROCUREMENT, ACTIONS.DELETE);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim());
  const [state, setState] = useState({ data: [], meta: null, loading: true, error: null });

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [city, setCity] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('30');
  const [rating, setRating] = useState('4');
  const [categoriesStr, setCategoriesStr] = useState('');
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, meta } = await procurementService.listVendors({ q: q || undefined, page, limit: PAGE_SIZE });
      setState({ data, meta, loading: false, error: null });
    } catch (error) {
      setState({ data: [], meta: null, loading: false, error });
    }
  }, [q, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setPage(1), [q]);

  const openCreate = () => {
    setEditing(null);
    setCode('');
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setGstin('');
    setCity('');
    setPaymentTermsDays('30');
    setRating('4');
    setCategoriesStr('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (v) => {
    setEditing(v);
    setCode(v.code);
    setName(v.name);
    setContactPerson(v.contactPerson || '');
    setPhone(v.phone || '');
    setEmail(v.email || '');
    setGstin(v.gstin || '');
    setCity(v.address?.city || '');
    setPaymentTermsDays(String(v.paymentTermsDays ?? 30));
    setRating(String(v.rating ?? 4));
    setCategoriesStr((v.categories || []).join(', '));
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const payload = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      email: email.trim(),
      gstin: gstin.trim().toUpperCase(),
      address: { city: city.trim() },
      paymentTermsDays: Number(paymentTermsDays) || 30,
      rating: Number(rating) || 4,
      categories: categoriesStr
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    };
    try {
      if (editing) {
        const { code: _, ...rest } = payload;
        await procurementService.updateVendor(editing.id, rest);
      } else {
        await procurementService.createVendor(payload);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setFormError(err.message || 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (v) => {
    if (!canDelete) return;
    if (!window.confirm(`Delete vendor ${v.code} (${v.name})?`)) return;
    try {
      await procurementService.deleteVendor(v.id);
      load();
    } catch (err) {
      alert(err.message || 'Cannot delete vendor');
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Vendor',
      render: (v) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{v.name}</p>
          <p className="truncate text-xs text-muted font-mono">
            {v.code}
            {v.gstin ? ` · GST: ${v.gstin}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (v) => (
        <div className="text-xs">
          <p className="text-ink font-medium">{v.contactPerson || '—'}</p>
          <p className="text-muted">{v.phone || v.email || '—'}</p>
        </div>
      ),
    },
    {
      key: 'categories',
      header: 'Categories',
      render: (v) =>
        v.categories?.length ? (
          <div className="flex flex-wrap gap-1">
            {v.categories.slice(0, 2).map((c, i) => (
              <Badge key={i} tone="neutral" className="text-[10px]">
                {c}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted">General</span>
        ),
    },
    {
      key: 'terms',
      header: 'Credit Terms',
      className: 'tabular text-xs text-muted',
      render: (v) => `${v.paymentTermsDays} days`,
    },
    {
      key: 'rating',
      header: 'Rating',
      render: (v) => (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-700">
          <Star className="h-3.5 w-3.5 fill-accent-500 text-accent-500" /> {v.rating}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (v) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canUpdate && (
            <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
              <Edit3 className="h-4 w-4 text-muted hover:text-ink" />
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" onClick={() => handleDelete(v)}>
              <Trash2 className="h-4 w-4 text-muted hover:text-danger-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Vendors & Suppliers"
        description="Registered suppliers, tax details, payment terms and material categories."
        actions={
          canCreate && (
            <Button leftIcon={Plus} onClick={openCreate}>
              New vendor
            </Button>
          )
        }
      />

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-lg shadow-overlay max-h-[90vh] overflow-y-auto">
            <CardHeader title={editing ? `Edit Vendor (${editing.code})` : 'Add New Vendor'} />
            <form onSubmit={handleSave}>
              <CardBody className="space-y-4">
                {formError && (
                  <div className="rounded border border-danger-200 bg-danger-50 p-2.5 text-xs text-danger-700">
                    {formError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Vendor Code *</label>
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="VND-001"
                      className="font-mono uppercase"
                      disabled={Boolean(editing)}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">GSTIN</label>
                    <Input
                      value={gstin}
                      onChange={(e) => setGstin(e.target.value.toUpperCase())}
                      placeholder="29AABCU9603R1ZM"
                      className="font-mono uppercase"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Vendor Name *</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Contact Person</label>
                    <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Phone</label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Email</label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">City</label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Payment Terms (Days)</label>
                    <Input type="number" min="0" value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Rating (1–5)</label>
                    <Select
                      value={rating}
                      onChange={(e) => setRating(e.target.value)}
                      options={[5, 4, 3, 2, 1].map((r) => ({ value: String(r), label: `${r} Stars` }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Categories (comma-separated)</label>
                  <Input
                    value={categoriesStr}
                    onChange={(e) => setCategoriesStr(e.target.value)}
                    placeholder="Cement & Concrete, Steel & Reinforcement"
                  />
                </div>
              </CardBody>
              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving}>
                  {editing ? 'Save changes' : 'Create vendor'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      <Card>
        <TableToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search vendor name, code or GSTIN..." />
        <DataTable
          columns={columns}
          data={state.data}
          loading={state.loading}
          error={state.error}
          onRetry={load}
          emptyTitle="No vendors registered"
          emptyDescription="Add suppliers to issue purchase orders."
          onRowClick={(v) => canUpdate && openEdit(v)}
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

