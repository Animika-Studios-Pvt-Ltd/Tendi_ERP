import { FolderPlus, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import DataTable from '@/components/tables/DataTable';
import TableToolbar from '@/components/tables/TableToolbar';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Select from '@/components/ui/Select';
import { MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { projectsService } from '@/services/projects.service';
import { formatCurrencyCompact, formatDate } from '@/utils/format';
import { PROJECT_STATUS_OPTIONS } from '../constants';
import ProgressBar from '../components/ProgressBar';

const PAGE_SIZE = 20;

const COLUMNS = [
  {
    key: 'name',
    header: 'Project',
    render: (project) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{project.name}</p>
        <p className="tabular text-xs text-muted">
          {project.code}
          {project.client.name && ` · ${project.client.name}`}
        </p>
      </div>
    ),
  },
  {
    key: 'location',
    header: 'Location',
    render: (project) => [project.location.city, project.location.state].filter(Boolean).join(', ') || '—',
  },
  { key: 'status', header: 'Status', render: (project) => <StatusBadge status={project.status} /> },
  { key: 'manager', header: 'Project manager', render: (project) => project.projectManager?.fullName ?? '—' },
  {
    key: 'value',
    header: 'Contract value',
    align: 'right',
    className: 'tabular',
    render: (project) => (project.contractValue ? formatCurrencyCompact(project.contractValue) : '—'),
  },
  {
    key: 'timeline',
    header: 'Timeline',
    className: 'tabular whitespace-nowrap text-xs',
    render: (project) => `${formatDate(project.startDate)} – ${formatDate(project.plannedEndDate)}`,
  },
  { key: 'progress', header: 'Progress', width: '9rem', render: (project) => <ProgressBar value={project.progressPercent} /> },
];

export default function ProjectsListPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canCreate = can(MODULES.PROJECTS, 'create');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim());

  const [state, setState] = useState({ data: [], meta: null, loading: true, error: null });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, meta } = await projectsService.list({ q: q || undefined, status: status || undefined, page, limit: PAGE_SIZE });
      setState({ data, meta, loading: false, error: null });
    } catch (error) {
      setState({ data: [], meta: null, loading: false, error });
    }
  }, [q, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setPage(1), [q, status]);

  const filtered = Boolean(q || status);
  const newProject = canCreate && (
    <Button leftIcon={Plus} onClick={() => navigate('/projects/new')}>
      New project
    </Button>
  );

  return (
    <>
      <PageHeader title="Projects" description="Every project you can access, with client, status and timeline." actions={newProject} />
      <Card>
        <TableToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search name, code, client or city">
          <div className="w-full sm:w-44">
            <Select
              size="sm"
              aria-label="Filter by status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              placeholder="All statuses"
              options={PROJECT_STATUS_OPTIONS}
            />
          </div>
        </TableToolbar>
        <DataTable
          caption="Projects"
          columns={COLUMNS}
          data={state.data}
          loading={state.loading}
          error={state.error}
          onRetry={load}
          onRowClick={(project) => navigate(`/projects/${project.id}`)}
          emptyTitle={filtered ? 'No projects match these filters' : 'No projects yet'}
          emptyDescription={
            filtered
              ? 'Try a different search or status.'
              : canCreate
                ? 'Create the first project to start assigning teams and tracking progress.'
                : 'Projects you are added to will appear here.'
          }
          emptyAction={
            !filtered &&
            canCreate && (
              <Button variant="secondary" leftIcon={FolderPlus} onClick={() => navigate('/projects/new')}>
                Create a project
              </Button>
            )
          }
          pagination={state.meta && { page: state.meta.page, limit: state.meta.limit, total: state.meta.total, onPageChange: setPage }}
        />
      </Card>
    </>
  );
}
