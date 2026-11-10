import { HardHat, MapPin, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import DataTable from '@/components/tables/DataTable';
import TableToolbar from '@/components/tables/TableToolbar';
import Avatar from '@/components/ui/Avatar';
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
import { SITE_STATUS_OPTIONS } from '../constants';

const PAGE_SIZE = 20;

export default function SitesListPage() {
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
      const { data, meta } = await sitesService.listSites({
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

  const statusOptions = [{ value: '', label: 'All statuses' }, ...SITE_STATUS_OPTIONS];

  const columns = [
    {
      key: 'name',
      header: 'Site',
      render: (site) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{site.name}</p>
          <p className="tabular text-xs text-muted font-mono">{site.code}</p>
        </div>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      render: (site) =>
        site.project ? (
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-ink">{site.project.name}</p>
            <p className="tabular text-[11px] text-muted">{site.project.code}</p>
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'location',
      header: 'Location',
      render: (site) => {
        const parts = [site.location.city, site.location.state].filter(Boolean);
        return parts.length ? (
          <div className="flex items-center gap-1.5 text-xs text-muted truncate">
            <MapPin className="h-3.5 w-3.5 text-muted shrink-0" />
            <span className="truncate">{parts.join(', ')}</span>
          </div>
        ) : (
          <span className="text-muted text-xs">—</span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (site) => <StatusBadge status={site.status} />,
    },
    {
      key: 'engineer',
      header: 'Site engineer',
      render: (site) =>
        site.siteEngineer ? (
          <div className="flex items-center gap-2">
            <Avatar name={site.siteEngineer.fullName} size="sm" />
            <span className="truncate text-xs text-ink">{site.siteEngineer.fullName}</span>
          </div>
        ) : (
          <span className="text-muted text-xs">Unassigned</span>
        ),
    },
    {
      key: 'dates',
      header: 'Timeline',
      className: 'tabular whitespace-nowrap text-xs text-muted',
      render: (site) =>
        site.startDate
          ? `${formatDate(site.startDate)} – ${formatDate(site.targetCompletionDate) || 'Ongoing'}`
          : '—',
    },
  ];

  const newSiteButton = canCreate && (
    <Button leftIcon={Plus} onClick={() => navigate('/sites/new')}>
      New site
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Sites"
        description="Construction sites and work zones under your active projects."
        actions={newSiteButton}
      />
      <Card>
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search site name, code or city"
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
          emptyTitle="No sites found"
          emptyDescription={
            q || projectFilter || statusFilter
              ? 'Try adjusting your search filters.'
              : 'Add your first construction site.'
          }
          onRowClick={(site) => navigate(`/sites/${site.id}`)}
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

