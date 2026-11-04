import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';
import Pagination from './Pagination';

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };

/**
 * columns: [{ key, header, render?: (row) => node, align?, width?, className? }]
 * pagination: { page, limit, total, onPageChange } (server-side meta from the API)
 */
export default function DataTable({
  columns,
  data = [],
  rowKey = (row) => row._id ?? row.id,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'No records yet',
  emptyDescription,
  emptyAction,
  pagination,
  onRowClick,
  caption,
  dense = false,
  className,
}) {
  const cellPad = dense ? 'px-4 py-2' : 'px-4 py-3';

  let body;
  if (error) {
    body = (
      <tr>
        <td colSpan={columns.length}>
          <ErrorState error={error} onRetry={onRetry} />
        </td>
      </tr>
    );
  } else if (loading && data.length === 0) {
    body = Array.from({ length: 5 }, (_, i) => (
      <tr key={i} className="border-t border-line">
        {columns.map((column) => (
          <td key={column.key} className={cellPad}>
            <Skeleton className="h-4 w-full max-w-40" />
          </td>
        ))}
      </tr>
    ));
  } else if (data.length === 0) {
    body = (
      <tr>
        <td colSpan={columns.length}>
          <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
        </td>
      </tr>
    );
  } else {
    body = data.map((row) => (
      <tr
        key={rowKey(row)}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        className={cn('border-t border-line transition-colors', onRowClick && 'cursor-pointer hover:bg-navy-50/70')}
      >
        {columns.map((column) => (
          <td key={column.key} className={cn(cellPad, 'align-middle text-ink', ALIGN[column.align ?? 'left'], column.className)}>
            {column.render ? column.render(row) : row[column.key]}
          </td>
        ))}
      </tr>
    ));
  }

  return (
    <div className={cn('overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-navy-50/60">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(cellPad, 'text-xs font-semibold whitespace-nowrap text-muted', ALIGN[column.align ?? 'left'])}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody aria-busy={loading || undefined} className={cn(loading && data.length > 0 && 'opacity-60')}>
            {body}
          </tbody>
        </table>
      </div>
      {pagination && !error && pagination.total > 0 && <Pagination {...pagination} />}
    </div>
  );
}
