import { Calculator, CheckCircle2, Clock3, FolderPlus, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '@/components/tables/DataTable';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
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
import { estimationService } from '@/services/estimation.service';
import { projectsService } from '@/services/projects.service';
import { formatCurrencyCompact, formatDate } from '@/utils/format';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'returned', label: 'Returned' },
  { value: 'rejected', label: 'Rejected' },
];

export default function EstimatesListPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canCreate = can(MODULES.ESTIMATION, ACTIONS.CREATE);
  const [selectedProjectId] = useWorkingProjectFilter();

  const [query, setQuery] = useState({ q: '', status: '', page: 1 });
  const debouncedQ = useDebouncedValue(query.q, 250);
  const [state, setState] = useState({ items: [], meta: null, loading: true, error: null });

  const [projects, setProjects] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [form, setForm] = useState({
    title: '',
    enquiryCode: '',
    project: '',
    clientName: '',
    clientContact: '',
    clientPhone: '',
    city: '',
    stateName: '',
    overheadPercent: '10',
    contingencyPercent: '5',
    profitMarginPercent: '12',
    gstPercent: '18',
    proposalSummary: '',
  });

  useEffect(() => {
    projectsService
      .list({ limit: 100, sort: 'name' })
      .then(({ data }) => setProjects(data || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const params = {
        page: query.page,
        limit: PAGE_SIZE,
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(selectedProjectId ? { project: selectedProjectId } : {}),
      };
      const res = await estimationService.listEstimates(params);
      setState({ items: res.data || [], meta: res.meta, loading: false, error: null });
    } catch (error) {
      setState({ items: [], meta: null, loading: false, error });
    }
  }, [debouncedQ, query.page, query.status, selectedProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const { data } = await estimationService.createEstimate({
        title: form.title.trim(),
        enquiryCode: form.enquiryCode.trim(),
        project: form.project || selectedProjectId || null,
        client: {
          name: form.clientName.trim(),
          contactPerson: form.clientContact.trim(),
          phone: form.clientPhone.trim(),
        },
        location: { city: form.city.trim(), state: form.stateName.trim() },
        overheadPercent: Number(form.overheadPercent || 0),
        contingencyPercent: Number(form.contingencyPercent || 0),
        profitMarginPercent: Number(form.profitMarginPercent || 0),
        gstPercent: Number(form.gstPercent || 0),
        proposalSummary: form.proposalSummary.trim(),
      });
      setModalOpen(false);
      navigate(`/estimation/${data.id}`);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const approvedCount = state.items.filter((e) => e.status === 'approved').length;
  const pendingCount = state.items.filter((e) => ['submitted', 'under_review'].includes(e.status)).length;
  const convertedCount = state.items.filter((e) => Boolean(e.convertedProject)).length;
  const totalQuoted = state.items.reduce((sum, e) => sum + (e.quotedTotal || 0), 0);

  const columns = [
    {
      key: 'estimateNumber',
      header: 'Estimate',
      render: (e) => (
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-ink">{e.estimateNumber}</span>
            <Badge tone="neutral">v{e.version}</Badge>
          </div>
          <p className="font-medium text-ink">{e.title}</p>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Client / Enquiry',
      render: (e) => (
        <div className="text-xs">
          <p className="font-medium text-ink">{e.client?.name || 'Internal / Tender'}</p>
          <p className="text-muted">{e.enquiryCode || e.location?.city || '—'}</p>
        </div>
      ),
    },
    {
      key: 'directCost',
      header: 'Direct Cost',
      align: 'right',
      render: (e) => <span className="tabular-nums text-xs text-muted">{formatCurrencyCompact(e.boqSummary?.directCost || 0)}</span>,
    },
    {
      key: 'quotedTotal',
      header: 'Quoted Total',
      align: 'right',
      render: (e) => <span className="font-semibold tabular-nums text-ink">{formatCurrencyCompact(e.quotedTotal || 0)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={e.status} />
          {e.convertedProject && (
            <span className="text-[11px] font-medium text-emerald-700">{e.convertedProject.code}</span>
          )}
        </div>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (e) => <span className="text-xs text-muted">{formatDate(e.updatedAt)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Estimates & BOQ"
        description="Build enquiry estimates, quantity takeoffs, rate analyses, and commercial proposals."
        actions={
          canCreate && (
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" /> New estimate
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardBody className="flex items-center justify-between py-3">
            <div>
              <p className="text-xs text-muted">Estimates (page)</p>
              <p className="text-lg font-semibold text-ink">{state.meta?.total ?? state.items.length}</p>
            </div>
            <Calculator className="h-5 w-5 text-brand-600" />
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center justify-between py-3">
            <div>
              <p className="text-xs text-muted">Pending Approval</p>
              <p className="text-lg font-semibold text-amber-700">{pendingCount}</p>
            </div>
            <Clock3 className="h-5 w-5 text-amber-600" />
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center justify-between py-3">
            <div>
              <p className="text-xs text-muted">Approved / Converted</p>
              <p className="text-lg font-semibold text-emerald-700">
                {approvedCount} / {convertedCount}
              </p>
            </div>
            <FolderPlus className="h-5 w-5 text-emerald-600" />
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center justify-between py-3">
            <div>
              <p className="text-xs text-muted">Quoted Pipeline Value</p>
              <p className="text-lg font-semibold text-ink">{formatCurrencyCompact(totalQuoted)}</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-brand-600" />
          </CardBody>
        </Card>
      </div>

      <Card>
        <TableToolbar
          search={query.q}
          onSearchChange={(q) => setQuery((prev) => ({ ...prev, q, page: 1 }))}
          searchPlaceholder="Search by EST number, title, enquiry, or client…"
        >
          <Select
            className="w-44"
            value={query.status}
            onChange={(e) => setQuery((prev) => ({ ...prev, status: e.target.value, page: 1 }))}
            options={STATUS_OPTIONS}
          />
        </TableToolbar>

        <DataTable
          columns={columns}
          data={state.items}
          loading={state.loading}
          error={state.error}
          onRetry={load}
          emptyTitle="No estimates created yet"
          emptyDescription="Draft a BOQ estimate for a client enquiry or project package."
          onRowClick={(row) => navigate(`/estimation/${row.id}`)}
          pagination={{
            page: state.meta?.page ?? query.page,
            limit: state.meta?.limit ?? PAGE_SIZE,
            total: state.meta?.total ?? state.items.length,
            onPageChange: (page) => setQuery((prev) => ({ ...prev, page })),
          }}
        />
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <form onSubmit={handleCreate}>
              <CardHeader title="Create New Cost Estimate" description="Initialize an enquiry estimate before adding BOQ takeoffs." />
              <CardBody className="space-y-3">
                {formError && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-ink">Estimate Title *</label>
                    <Input
                      required
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g. G+7 Commercial Tower Core & Shell"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Enquiry Reference</label>
                    <Input
                      value={form.enquiryCode}
                      onChange={(e) => setForm({ ...form, enquiryCode: e.target.value })}
                      placeholder="ENQ-2026-01"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Link to Existing Project (Optional)</label>
                    <Select
                      value={form.project}
                      onChange={(e) => setForm({ ...form, project: e.target.value })}
                      placeholder="Pre-project enquiry"
                      options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Client Name</label>
                    <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Client Contact</label>
                    <Input value={form.clientContact} onChange={(e) => setForm({ ...form, clientContact: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">City</label>
                    <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">State</label>
                    <Input value={form.stateName} onChange={(e) => setForm({ ...form, stateName: e.target.value })} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className="text-xs font-medium text-ink">Overhead %</label>
                    <Input type="number" step="0.5" value={form.overheadPercent} onChange={(e) => setForm({ ...form, overheadPercent: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Contingency %</label>
                    <Input type="number" step="0.5" value={form.contingencyPercent} onChange={(e) => setForm({ ...form, contingencyPercent: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Margin %</label>
                    <Input type="number" step="0.5" value={form.profitMarginPercent} onChange={(e) => setForm({ ...form, profitMarginPercent: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">GST %</label>
                    <Input type="number" step="0.5" value={form.gstPercent} onChange={(e) => setForm({ ...form, gstPercent: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-ink">Commercial Scope Summary</label>
                  <Textarea
                    rows={2}
                    value={form.proposalSummary}
                    onChange={(e) => setForm({ ...form, proposalSummary: e.target.value })}
                  />
                </div>
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Estimate'}</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
