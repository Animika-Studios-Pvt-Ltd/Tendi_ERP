import { useSystemHealth } from '@/hooks/useSystemHealth';
import { cn } from '@/utils/cn';

const STATES = {
  checking: { label: 'Checking server', dot: 'bg-navy-300', detail: 'Contacting the API' },
  online: { label: 'All systems online', dot: 'bg-success-600', detail: 'API and database connected' },
  degraded: { label: 'Database unavailable', dot: 'bg-warning-600', detail: 'API is up, MongoDB is not connected' },
  offline: { label: 'Server unreachable', dot: 'bg-danger-600', detail: 'The API is not responding' },
};

/** Live API + database indicator backed by GET /health. */
export default function SystemStatus({ variant = 'dark', collapsed = false, className }) {
  const { state, report } = useSystemHealth();
  const meta = STATES[state];
  const title = report ? `${meta.detail}. Environment: ${report.environment}.` : meta.detail;

  return (
    <div title={title} role="status" className={cn('flex items-center gap-2 text-xs', variant === 'dark' ? 'text-navy-300' : 'text-muted', className)}>
      <span className="relative flex h-2 w-2 shrink-0">
        {state === 'online' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-600 opacity-40" />}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', meta.dot)} />
      </span>
      {collapsed ? <span className="sr-only">{meta.label}</span> : <span className="truncate">{meta.label}</span>}
    </div>
  );
}
