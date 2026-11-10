import { Calendar, CheckCircle2, Edit3, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import DataTable from '@/components/tables/DataTable';
import TableToolbar from '@/components/tables/TableToolbar';
import Avatar from '@/components/ui/Avatar';
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
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '../constants';

const PAGE_SIZE = 25;

const PRIORITY_TONES = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'danger',
};

export default function TasksListPage() {
  const { can } = useAuth();
  const canCreate = can(MODULES.PROJECTS, ACTIONS.CREATE);
  const canUpdate = can(MODULES.PROJECTS, ACTIONS.UPDATE);
  const canDelete = can(MODULES.PROJECTS, ACTIONS.DELETE);

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useWorkingProjectFilter();
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim());

  const [projects, setProjects] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [state, setState] = useState({ data: [], meta: null, loading: true, error: null });

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [project, setProject] = useState('');
  const [milestone, setMilestone] = useState('');
  const [parentTask, setParentTask] = useState('');
  const [wbsCode, setWbsCode] = useState('');
  const [workPackage, setWorkPackage] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [status, setStatus] = useState('todo');
  const [priority, setPriority] = useState('medium');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('0');
  const [progressPercent, setProgressPercent] = useState('0');
  const [dependencies, setDependencies] = useState([]);
  const [description, setDescription] = useState('');

  useEffect(() => {
    projectsService
      .list({ limit: 100 })
      .then(({ data }) => setProjects(data))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, meta } = await projectsService.listTasks({
        q: q || undefined,
        project: projectFilter || undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setState({ data, meta, loading: false, error: null });
    } catch (error) {
      setState({ data: [], meta: null, loading: false, error });
    }
  }, [q, projectFilter, statusFilter, priorityFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setPage(1), [q, projectFilter, statusFilter, priorityFilter]);

  // Load milestones, project tasks & users when modal project changes
  useEffect(() => {
    if (!modalOpen || !project) {
      setMilestones([]);
      setProjectTasks([]);
      return;
    }
    Promise.all([
      projectsService.listMilestones({ project, limit: 100 }),
      projectsService.team(project).catch(() => ({ data: [] })),
      projectsService.listTasks({ project, limit: 100 }).catch(() => ({ data: [] })),
    ])
      .then(([mRes, tRes, pTasksRes]) => {
        setMilestones(mRes.data || []);
        setUsers(tRes.data || []);
        setProjectTasks(pTasksRes.data || []);
      })
      .catch(() => {});
  }, [modalOpen, project]);

  const openCreateModal = () => {
    setEditingTask(null);
    setTitle('');
    setProject(projectFilter || (projects[0]?.id ?? ''));
    setMilestone('');
    setParentTask('');
    setWbsCode('');
    setWorkPackage('');
    setAssignedTo('');
    setStatus('todo');
    setPriority('medium');
    setStartDate('');
    setDueDate('');
    setEstimatedHours('0');
    setProgressPercent('0');
    setDependencies([]);
    setDescription('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    setTitle(task.title);
    setProject(task.project?.id || '');
    setMilestone(task.milestone?.id || '');
    setParentTask(task.parentTask?.id || '');
    setWbsCode(task.wbsCode || '');
    setWorkPackage(task.workPackage || '');
    setAssignedTo(task.assignedTo?.id || '');
    setStatus(task.status);
    setPriority(task.priority);
    setStartDate(task.startDate ? task.startDate.slice(0, 10) : '');
    setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : '');
    setEstimatedHours(String(task.estimatedHours ?? 0));
    setProgressPercent(String(task.progressPercent ?? 0));
    setDependencies((task.dependencies || []).map((d) => (typeof d === 'object' ? d.id : d)));
    setDescription(task.description || '');
    setFormError(null);
    setModalOpen(true);
  };

  const toggleDependency = (depId) => {
    setDependencies((prev) => (prev.includes(depId) ? prev.filter((id) => id !== depId) : [...prev, depId]));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim() || !project) {
      setFormError('Title and Project are required.');
      return;
    }

    const payload = {
      title: title.trim(),
      project,
      milestone: milestone || null,
      parentTask: parentTask || null,
      wbsCode: wbsCode.trim().toUpperCase(),
      workPackage: workPackage.trim(),
      assignedTo: assignedTo || null,
      status,
      priority,
      startDate: startDate || null,
      dueDate: dueDate || null,
      estimatedHours: Number(estimatedHours) || 0,
      progressPercent: Number(progressPercent) || 0,
      dependencies,
      description: description.trim(),
    };

    setSaving(true);
    try {
      if (editingTask) {
        await projectsService.updateTask(editingTask.id, payload);
      } else {
        await projectsService.createTask(payload);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setFormError(err.message || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (task) => {
    if (!canDelete) return;
    if (!window.confirm(`Delete task ${task.code} (${task.title})?`)) return;
    try {
      await projectsService.deleteTask(task.id);
      load();
    } catch (err) {
      alert(err.message || 'Failed to delete task');
    }
  };

  const projectOptions = [
    { value: '', label: 'All projects' },
    ...projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
  ];

  const columns = [
    {
      key: 'title',
      header: 'Task',
      render: (t) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">
            {t.wbsCode ? <span className="mr-1.5 font-mono text-xs text-navy-600">{t.wbsCode}</span> : null}
            {t.title}
          </p>
          <p className="tabular text-xs text-muted font-mono">
            {t.code}
            {t.workPackage ? ` · ${t.workPackage}` : ''}
            {t.project ? ` · ${t.project.code}` : ''}
            {t.milestone ? ` · ${t.milestone.title}` : ''}
            {t.dependencies?.length ? ` · ${t.dependencies.length} dep(s)` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'assignee',
      header: 'Assignee',
      render: (t) =>
        t.assignedTo ? (
          <div className="flex items-center gap-2">
            <Avatar name={t.assignedTo.fullName} size="sm" />
            <span className="truncate text-xs text-ink">{t.assignedTo.fullName}</span>
          </div>
        ) : (
          <span className="text-xs text-muted">Unassigned</span>
        ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (t) => (
        <Badge tone={PRIORITY_TONES[t.priority] || 'neutral'} className="capitalize">
          {t.priority}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => <StatusBadge status={t.status} />,
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '8rem',
      render: (t) => <ProgressBar value={t.progressPercent} />,
    },
    {
      key: 'dueDate',
      header: 'Due Date',
      className: 'tabular whitespace-nowrap text-xs text-muted',
      render: (t) => (t.dueDate ? formatDate(t.dueDate) : '—'),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (t) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canUpdate && (
            <Button variant="ghost" size="sm" title="Edit task" onClick={() => openEditModal(t)}>
              <Edit3 className="h-4 w-4 text-muted hover:text-ink" />
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" title="Delete task" onClick={() => handleDelete(t)}>
              <Trash2 className="h-4 w-4 text-muted hover:text-danger-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const addButton = canCreate && (
    <Button leftIcon={Plus} onClick={openCreateModal}>
      New task
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Project Tasks"
        description="Work breakdown tasks, assignees, priorities and schedule progress."
        actions={addButton}
      />

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-lg shadow-overlay max-h-[90vh] overflow-y-auto">
            <CardHeader title={editingTask ? `Edit Task (${editingTask.code})` : 'Create New Task'} />
            <form onSubmit={handleSave}>
              <CardBody className="space-y-4">
                {formError && (
                  <div className="rounded-md border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Task title *</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Pour RCC slab for Level 3"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Project *</label>
                    <Select
                      value={project}
                      onChange={(e) => {
                        setProject(e.target.value);
                        setMilestone('');
                        setAssignedTo('');
                      }}
                      options={[
                        { value: '', label: 'Select project…' },
                        ...projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
                      ]}
                      disabled={Boolean(editingTask)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Milestone (optional)</label>
                    <Select
                      value={milestone}
                      onChange={(e) => setMilestone(e.target.value)}
                      options={[
                        { value: '', label: 'None' },
                        ...milestones.map((m) => ({ value: m.id, label: m.title })),
                      ]}
                      disabled={!project}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">WBS Code</label>
                    <Input
                      value={wbsCode}
                      onChange={(e) => setWbsCode(e.target.value.toUpperCase())}
                      placeholder="e.g. 1.2.1"
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Work Package</label>
                    <Input
                      value={workPackage}
                      onChange={(e) => setWorkPackage(e.target.value)}
                      placeholder="e.g. Substructure RCC"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Parent WBS Task</label>
                    <Select
                      value={parentTask}
                      onChange={(e) => setParentTask(e.target.value)}
                      options={[
                        { value: '', label: 'Top-level task' },
                        ...projectTasks
                          .filter((pt) => !editingTask || pt.id !== editingTask.id)
                          .map((pt) => ({ value: pt.id, label: `${pt.wbsCode || pt.code} - ${pt.title}` })),
                      ]}
                      disabled={!project}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Status</label>
                    <Select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      options={TASK_STATUS_OPTIONS}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Priority</label>
                    <Select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      options={TASK_PRIORITY_OPTIONS}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Est. Hours</label>
                    <Input
                      type="number"
                      min="0"
                      value={estimatedHours}
                      onChange={(e) => setEstimatedHours(e.target.value)}
                    />
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

                {projectTasks.filter((pt) => !editingTask || pt.id !== editingTask.id).length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Predecessor Dependencies</label>
                    <div className="max-h-24 overflow-y-auto rounded-md border border-line bg-canvas p-2 space-y-1">
                      {projectTasks
                        .filter((pt) => !editingTask || pt.id !== editingTask.id)
                        .map((pt) => (
                          <label key={pt.id} className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                            <input
                              type="checkbox"
                              checked={dependencies.includes(pt.id)}
                              onChange={() => toggleDependency(pt.id)}
                              className="h-3.5 w-3.5 rounded border-line"
                            />
                            <span className="font-mono text-muted">{pt.code}</span>
                            <span className="truncate">{pt.title}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Assignee</label>
                    <Select
                      value={assignedTo}
                      onChange={(e) => setAssignedTo(e.target.value)}
                      options={[
                        { value: '', label: 'Unassigned' },
                        ...users.map((u) => ({ value: u.id, label: u.fullName })),
                      ]}
                      disabled={!project}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Start date</label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Due date</label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Description</label>
                  <Textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Instructions, scope or specifications..."
                  />
                </div>
              </CardBody>
              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving}>
                  {editingTask ? 'Save changes' : 'Create task'}
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
          searchPlaceholder="Search task code or title..."
        >
          <div className="w-full sm:w-52">
            <Select
              size="sm"
              value={projectFilter}
              options={projectOptions}
              onChange={(e) => setProjectFilter(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-36">
            <Select
              size="sm"
              value={statusFilter}
              options={[{ value: '', label: 'All statuses' }, ...TASK_STATUS_OPTIONS]}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-36">
            <Select
              size="sm"
              value={priorityFilter}
              options={[{ value: '', label: 'All priorities' }, ...TASK_PRIORITY_OPTIONS]}
              onChange={(e) => setPriorityFilter(e.target.value)}
            />
          </div>
        </TableToolbar>

        <DataTable
          columns={columns}
          data={state.data}
          loading={state.loading}
          error={state.error}
          onRetry={load}
          emptyTitle="No tasks found"
          emptyDescription="Create work breakdown tasks to track execution across your projects."
          onRowClick={(t) => canUpdate && openEditModal(t)}
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

