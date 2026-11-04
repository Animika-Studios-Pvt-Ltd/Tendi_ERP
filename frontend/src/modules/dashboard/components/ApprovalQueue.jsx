import { ClipboardCheck } from 'lucide-react';
import StatusBadge from '@/components/common/StatusBadge';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatCurrencyCompact } from '@/utils/format';

export default function ApprovalQueue({ items, total }) {
  return (
    <Card className="flex flex-col">
      <CardHeader icon={ClipboardCheck} title="Waiting for approval" description={`${total} items across procurement, finance and site reports.`} />
      <ul className="flex-1 divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="px-5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {item.type} {item.id}, {item.project}
                </p>
              </div>
              {item.amount != null && <p className="tabular shrink-0 text-sm font-semibold text-ink">{formatCurrencyCompact(item.amount)}</p>}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
              <span className="truncate">
                From {item.requestedBy}, waiting {item.waiting}
              </span>
              <StatusBadge status={item.status} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
