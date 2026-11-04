import { Inbox } from 'lucide-react';
import { cn } from '@/utils/cn';

export default function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-6' : 'px-6 py-12', className)}>
      <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-navy-50 text-navy-500 ring-1 ring-line">
        <Icon size={18} aria-hidden="true" />
      </span>
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
