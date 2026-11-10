import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/tables/DataTable';
import TableToolbar from '@/components/tables/TableToolbar';
import Badge from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import Select from '@/components/ui/Select';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useWorkingProjectFilter } from '@/hooks/useWorkingProjectFilter';
import { inventoryService } from '@/services/inventory.service';
import { projectsService } from '@/services/projects.service';
import { formatCurrencyCompact, formatDate } from '@/utils/format';
import { ALL_TRANSACTION_FILTER_OPTIONS } from '../constants';

const PAGE_SIZE = 25;

const TYPE_TONES = {
  opening: 'info',
  receipt: 'success',
  return: 'success',
  transfer_in: 'success',
  issue: 'warning',
  transfer_out: 'warning',
  adjustment: 'neutral',
};

export default function TransactionsListPage() {
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useWorkingProjectFilter();
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim());

  const [projects, setProjects] = useState([]);
  const [state, setState] = useState({ data: [], meta: null, loading: true, error: null });

  useEffect(() => {
    projectsService
      .list({ limit: 100 })
      .then(({ data }) => setProjects(data || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, meta } = await inventoryService.listTransactions({
        q: q || undefined,
        project: projectFilter || undefined,
        type: typeFilter || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setState({ data, meta, loading: false, error: null });
    } catch (error) {
      setState({ data: [], meta: null, loading: false, error });
    }
  }, [q, projectFilter, typeFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setPage(1), [q, projectFilter, typeFilter]);

  const columns = [
    {
      key: 'date',
      header: 'Date & Tx #',
      render: (tx) => (
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-ink">{tx.transactionNumber}</p>
          <p className="tabular text-xs text-muted">{formatDate(tx.transactionDate)}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (tx) => (
        <Badge tone={TYPE_TONES[tx.type] || 'neutral'} className="capitalize">
          {tx.type.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'material',
      header: 'Material',
      render: (tx) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink">{tx.material?.name || '—'}</p>
          <p className="truncate text-[11px] text-muted font-mono">{tx.material?.code}</p>
        </div>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      render: (tx) => (
        <span className="text-xs text-ink">
          {tx.project ? `${tx.project.code}` : '—'}
        </span>
      ),
    },
    {
      key: 'delta',
      header: 'Qty Change',
      align: 'right',
      className: 'tabular font-bold text-xs',
      render: (tx) => (
        <span className={tx.delta >= 0 ? 'text-success-600' : 'text-danger-600'}>
          {tx.delta > 0 ? `+${tx.delta}` : tx.delta} {tx.material?.unit}
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      className: 'tabular text-xs text-muted',
      render: (tx) => (tx.totalValue ? formatCurrencyCompact(tx.totalValue) : '—'),
    },
    {
      key: 'details',
      header: 'Details / Remarks',
      render: (tx) => (
        <div className="min-w-0 max-w-xs">
          {tx.issuedTo && <p className="truncate text-xs font-medium text-ink">To: {tx.issuedTo}</p>}
          {tx.referenceNumber && <p className="truncate text-[11px] font-mono text-muted">Ref: {tx.referenceNumber}</p>}
          {tx.remarks && <p className="truncate text-xs text-muted">{tx.remarks}</p>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Stock Movements Ledger"
        description="Immutable audit trail of every material receipt, issue, return and inter-site transfer."
      />
      <Card>
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search Tx #, reference, issued to or remarks..."
        >
          <div className="w-full sm:w-52">
            <Select
              size="sm"
              value={projectFilter}
              options={[
                { value: '', label: 'All projects' },
                ...projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
              ]}
              onChange={(e) => setProjectFilter(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              size="sm"
              value={typeFilter}
              options={ALL_TRANSACTION_FILTER_OPTIONS}
              onChange={(e) => setTypeFilter(e.target.value)}
            />
          </div>
        </TableToolbar>

        <DataTable
          columns={columns}
          data={state.data}
          loading={state.loading}
          error={state.error}
          onRetry={load}
          emptyTitle="No transactions recorded"
          emptyDescription="Stock movements appear here automatically when opening stock, GRNs, or issues are logged."
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

