import { CheckCircle2, Edit3, Flag, Plus, Trash2 } from 'lucide-react';
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
import { projectsService } from '@/services/projects.service';
import { formatDate } from '@/utils/format';
import ProgressBar from '../components/ProgressBar';
import { MILESTONE_STATUS_OPTIONS } from '../constants';

const PAGE_SIZE = 20;

export default function MilestonesListPage() {
  const { can } = useAuth();
  const canCreate = can(MODULES.PROJECTS, ACTIONS.CREATE);
  const canUpdate = can(MODULES.PROJECTS, ACTIONS.UPDATE);
  const canDelete = can(MODULES.PROJECTS, ACTIONS.DELETE);

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useWorkingProjectFilter();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim());

  const [projects, setProjects] = useState([]);
  const [state, setState] = useState({ data: [], meta: null, loading: true, error: null });

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [project, setProject] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [actualDate, setActualDate] = useState('');
  const [status, setStatus] = useState('pending');
  const [progressPercent, setProgressPercent] = useState('0');
  const [description, setDescription] = useState('');
  const [deliverablesStr, setDeliverablesStr] = useState('');

  useEffect(() => {
    projectsService
      .list({ limit: 100 })
      .then(({ data }) => setProjects(data))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, meta } = await projectsService.listMilestones({
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

  const openCreateModal = () => {
    setEditingMilestone(null);
    setTitle('');
    setProject(projectFilter || (projects[0]?.id ?? ''));
    setTargetDate('');
    setActualDate('');
    setStatus('pending');
    setProgressPercent('0');
    setDescription('');
    setDeliverablesStr('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (m) => {
    setEditingMilestone(m);
    setTitle(m.title);
    setProject(m.project?.id || '');
    setTargetDate(m.targetDate ? m.targetDate.slice(0, 10) : '');
    setActualDate(m.actualDate ? m.actualDate.slice(0, 10) : '');
    setStatus(m.status);
    setProgressPercent(String(m.progressPercent ?? 0));
    setDescription(m.description || '');
    setDeliverablesStr((m.deliverables || []).join(', '));
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim() || !project || !targetDate) {
      setFormError('Title, Project and Target Date are required.');
      return;
    }

    const deliverables = deliverablesStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      title: title.trim(),
      project,
      targetDate,
      actualDate: actualDate || null,
      status,
      progressPercent: Number(progressPercent) || 0,
      description: description.trim(),
      deliverables,
    };

    setSaving(true);
    try {
      if (editingMilestone) {
        await projectsService.updateMilestone(editingMilestone.id, payload);
      } else {
        await projectsService.createMilestone(payload);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setFormError(err.message || 'Failed to save milestone');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m) => {
    if (!canDelete) return;
    if (!window.confirm(`Delete milestone "${m.title}"?`)) return;
    try {
      await projectsService.deleteMilestone(m.id);
      load();
    } catch (err) {
      alert(err.message || 'Failed to delete milestone');
    }
  };

  const projectOptions = [
    { value: '', label: 'All projects' },
    ...projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
  ];

  const columns = [
    {
      key: 'title',
      header: 'Milestone',
      render: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{m.title}</p>
          <p className="truncate text-xs text-muted">
            {m.project ? `${m.project.code} · ${m.project.name}` : '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'deliverables',
      header: 'Key Deliverables',
      render: (m) =>
        m.deliverables?.length ? (
          <div className="flex flex-wrap gap-1 max-w-xs">
            {m.deliverables.slice(0, 2).map((d, i) => (
              <Badge key={i} tone="neutral" className="text-[10px]">
                {d}
              </Badge>
            ))}
            {m.deliverables.length > 2 && (
              <span className="text-[10px] text-muted">+{m.deliverables.length - 2} more</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (m) => <StatusBadge status={m.status} />,
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '8rem',
      render: (m) => <ProgressBar value={m.progressPercent} />,
    },
    {
      key: 'targetDate',
      header: 'Target Date',
      className: 'tabular whitespace-nowrap text-xs text-muted',
      render: (m) => formatDate(m.targetDate),
    },
    {
      key: 'actualDate',
      header: 'Actual Date',
      className: 'tabular whitespace-nowrap text-xs text-muted',
      render: (m) => (m.actualDate ? formatDate(m.actualDate) : '—'),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canUpdate && (
            <Button variant="ghost" size="sm" title="Edit milestone" onClick={() => openEditModal(m)}>
              <Edit3 className="h-4 w-4 text-muted hover:text-ink" />
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" title="Delete milestone" onClick={() => handleDelete(m)}>
              <Trash2 className="h-4 w-4 text-muted hover:text-danger-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const addButton = canCreate && (
    <Button leftIcon={Plus} onClick={openCreateModal}>
      New milestone
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Project Milestones"
        description="Key delivery checkpoints, planned vs actual dates, and deliverables tracking."
        actions={addButton}
      />

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-lg shadow-overlay max-h-[90vh] overflow-y-auto">
            <CardHeader title={editingMilestone ? 'Edit Milestone' : 'Create New Milestone'} />
            <form onSubmit={handleSave}>
              <CardBody className="space-y-4">
                {formError && (
                  <div className="rounded-md border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Milestone title *</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Structure Topping-Out"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Project *</label>
                    <Select
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                      options={[
                        { value: '', label: 'Select project…' },
                        ...projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
                      ]}
                      disabled={Boolean(editingMilestone)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Status</label>
                    <Select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      options={MILESTONE_STATUS_OPTIONS}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Target date *</label>
                    <Input
                      type="date"
                      value={targetDate}
                      onChange={(e) => setTargetDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Actual date</label>
                    <Input type="date" value={actualDate} onChange={(e) => setActualDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Progress (%)</label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={progressPercent}
                      onChange={(e) => setProgressPercent(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">
                    Deliverables (comma-separated)
                  </label>
                  <Input
                    value={deliverablesStr}
                    onChange={(e) => setDeliverablesStr(e.target.value)}
                    placeholder="e.g. Final slab casting, Structural sign-off, Safety clearance"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Description</label>
                  <Textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Milestone scope and completion criteria..."
                  />
                </div>
              </CardBody>
              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving}>
                  {editingMilestone ? 'Save changes' : 'Create milestone'}
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
          searchPlaceholder="Search milestone title..."
        >
          <div className="w-full sm:w-56">
            <Select
              size="sm"
              value={projectFilter}
              options={projectOptions}
              onChange={(e) => setProjectFilter(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-40">
            <Select
              size="sm"
              value={statusFilter}
              options={[{ value: '', label: 'All statuses' }, ...MILESTONE_STATUS_OPTIONS]}
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
          emptyTitle="No milestones defined"
          emptyDescription="Set up delivery milestones to track progress across critical project phases."
          onRowClick={(m) => canUpdate && openEditModal(m)}
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

