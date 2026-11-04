import Badge from '@/components/ui/Badge';
import { STATUS_META } from '@/constants/app';

export default function StatusBadge({ status, className }) {
  const meta = STATUS_META[status] ?? { label: status?.replace(/_/g, ' ') ?? 'Unknown', tone: 'neutral' };
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  );
}
