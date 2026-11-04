import { PackageSearch } from 'lucide-react';
import StatusBadge from '@/components/common/StatusBadge';
import DataTable from '@/components/tables/DataTable';
import { Card, CardHeader } from '@/components/ui/Card';
import { cn } from '@/utils/cn';
import { formatNumber } from '@/utils/format';

const columns = [
  {
    key: 'material',
    header: 'Material',
    render: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.material}</p>
        <p className="truncate text-xs text-muted">{row.site}</p>
      </div>
    ),
  },
  {
    key: 'level',
    header: 'On hand / reorder level',
    width: '48%',
    render: (row) => {
      const ratio = Math.min(row.onHand / row.reorderLevel, 1);
      const out = row.onHand === 0;
      return (
        <div>
          <p className="tabular text-xs whitespace-nowrap">
            <span className={cn('font-semibold', out ? 'text-danger-700' : 'text-ink')}>{formatNumber(row.onHand)}</span>
            <span className="text-muted">
              {' '}
              / {formatNumber(row.reorderLevel)} {row.unit}
            </span>
          </p>
          <div className="mt-1.5 h-1.5 rounded-full bg-navy-50">
            <div className={cn('h-full rounded-full', out ? 'bg-danger-600' : 'bg-warning-600')} style={{ width: `${Math.max(ratio * 100, 2)}%` }} />
          </div>
          {out && <StatusBadge status="out_of_stock" className="mt-2" />}
        </div>
      );
    },
  },
];

export default function LowStockTable({ rows }) {
  return (
    <Card className="lg:col-span-2 xl:col-span-1">
      <CardHeader icon={PackageSearch} title="Below reorder level" description="Materials to requisition before they hold up work." />
      <DataTable columns={columns} data={rows} rowKey={(row) => row.id} dense caption="Materials below reorder level" />
    </Card>
  );
}
