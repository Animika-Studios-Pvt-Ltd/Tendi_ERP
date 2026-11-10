import { CloudSun, FileText, Filter, HardHat, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import DataTable from '@/components/tables/DataTable';
import TableToolbar from '@/components/tables/TableToolbar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Select from '@/components/ui/Select';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useWorkingProjectFilter } from '@/hooks/useWorkingProjectFilter';
import { projectsService } from '@/services/projects.service';
import { sitesService } from '@/services/sites.service';
import { formatDate } from '@/utils/format';
import { DPR_STATUS_OPTIONS } from '../constants';

const PAGE_SIZE = 25;

export default function DprListPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canCreate = can(MODULES.SITES, ACTIONS.CREATE);

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useWorkingProjectFilter();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim());

  const [projects, setProjects] = useState([]);
  const [state, setState] = useState({ data: [], meta: null, loading: true, error: null });

  useEffect(() => {
    projectsService
      .list({ limit: 100 })
      .then(({ data }) => setProjects(data))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, meta } = await sitesService.listDprs({
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

  const projectOptions = [
    { value: '', label: 'All projects' },
    ...projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
  ];

  const statusOptions = [{ value: '', label: 'All statuses' }, ...DPR_STATUS_OPTIONS];

  const columns = [
    {
      key: 'reportNumber',
      header: 'Report #',
      render: (dpr) => (
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-ink">{dpr.reportNumber}</p>
          <p className="tabular text-xs text-muted">{formatDate(dpr.reportDate)}</p>
        </div>
      ),
    },
    {
      key: 'site',
      header: 'Site & Project',
      render: (dpr) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-xs text-ink">{dpr.site?.name || '—'}</p>
          <p className="truncate text-[11px] text-muted">
            {dpr.project ? `${dpr.project.code} · ${dpr.project.name}` : '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'weather',
      header: 'Weather',
      render: (dpr) => (
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <CloudSun className="h-3.5 w-3.5 text-muted shrink-0" />
          <span className="capitalize">{dpr.weather?.condition || 'Normal'}</span>
          {dpr.weather?.temperature ? (
            <span className="tabular text-muted">({dpr.weather.temperature}°C)</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'labour',
      header: 'Labour Count',
      className: 'tabular text-xs',
      render: (dpr) => {
        const totalHeadcount = (dpr.labourAttendance || []).reduce((acc, curr) => acc + (curr.headcount || 0), 0);
        return (
          <span className="font-medium text-ink">
            {totalHeadcount} workers
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (dpr) => <StatusBadge status={dpr.status} />,
    },
    {
      key: 'submittedBy',
      header: 'Logged by',
      render: (dpr) => (
        <span className="text-xs text-muted truncate">
          {dpr.createdBy?.fullName || '—'}
        </span>
      ),
    },
  ];

  const newDprButton = canCreate && (
    <Button leftIcon={Plus} onClick={() => navigate('/sites/daily-progress/new')}>
      Draft daily report
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Daily Progress Reports"
        description="Daily site logs, labour counts, material consumption, and supervisor approvals."
        actions={newDprButton}
      />
      <Card>
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search report #, activities or remarks"
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
              options={statusOptions}
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
          emptyTitle="No daily reports filed"
          emptyDescription={
            q || projectFilter || statusFilter
              ? 'Try adjusting your filters.'
              : 'Log today’s site progress and labour attendance.'
          }
          onRowClick={(dpr) => navigate(`/sites/daily-progress/${dpr.id}`)}
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

