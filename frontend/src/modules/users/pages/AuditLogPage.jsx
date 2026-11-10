import { ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/tables/DataTable';
import TableToolbar from '@/components/tables/TableToolbar';
import Badge from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import Select from '@/components/ui/Select';
import { MODULES } from '@/constants/permissions';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usersService } from '@/services/users.service';
import { formatDateTime } from '@/utils/format';

const PAGE_SIZE = 25;

const MODULE_OPTIONS = [
  { value: '', label: 'All modules' },
  { value: 'auth', label: 'Authentication' },
  ...Object.values(MODULES).map((m) => ({ value: m, label: m })),
];

export default function AuditLogPage() {
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim(), 300);

  const [state, setState] = useState({ data: [], meta: null, loading: true, error: null });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, meta } = await usersService.listAuditLogs({
        q: q || undefined,
        module: moduleFilter || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setState({ data: data || [], meta, loading: false, error: null });
    } catch (error) {
      setState({ data: [], meta: null, loading: false, error });
    }
  }, [q, moduleFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setPage(1), [q, moduleFilter]);

  const columns = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      className: 'tabular whitespace-nowrap text-xs text-muted',
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink">{row.actor?.fullName || 'System'}</p>
          {row.actor?.email && <p className="truncate text-[11px] text-muted">{row.actor.email}</p>}
        </div>
      ),
    },
    {
      key: 'module',
      header: 'Module',
      render: (row) => (
        <Badge tone="neutral" className="uppercase">
          {row.module}
        </Badge>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => <span className="font-mono text-xs text-ink">{row.action}</span>,
    },
    {
      key: 'project',
      header: 'Project',
      render: (row) => <span className="text-xs text-muted">{row.project?.code || '—'}</span>,
    },
    {
      key: 'summary',
      header: 'Summary',
      render: (row) => <span className="text-xs text-ink">{row.summary || row.entityType || '—'}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Immutable security and operational audit trail across ERP modules."
        meta={
          <Badge tone="info">
            <ShieldCheck size={12} aria-hidden="true" /> Security trail
          </Badge>
        }
      />

      <Card>
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search action, summary or entity"
        >
          <div className="w-full sm:w-48">
            <Select
              size="sm"
              aria-label="Filter by module"
              value={moduleFilter}
              options={MODULE_OPTIONS}
              onChange={(e) => setModuleFilter(e.target.value)}
            />
          </div>
        </TableToolbar>

        <DataTable
          caption="Audit Log"
          columns={columns}
          data={state.data}
          loading={state.loading}
          error={state.error}
          onRetry={load}
          emptyTitle="No audit events found"
          emptyDescription="Actions such as logins, user edits, approvals and stock movements appear here."
          pagination={
            state.meta && {
              page: state.meta.page,
              limit: state.meta.limit,
              total: state.meta.total,
              onPageChange: setPage,
            }
          }
        />
      </Card>
    </>
  );
}

