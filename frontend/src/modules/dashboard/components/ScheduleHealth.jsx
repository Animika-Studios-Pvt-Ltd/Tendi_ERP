import { CalendarRange } from 'lucide-react';
import StatusBadge from '@/components/common/StatusBadge';
import { Card, CardHeader } from '@/components/ui/Card';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format';

function ProgressTrack({ planned, actual }) {
  const behind = actual < planned;
  return (
    <div className="relative h-3 w-full rounded-sm bg-navy-50 ring-1 ring-line ring-inset" role="img" aria-label={`Planned ${planned}%, actual ${actual}%`}>
      <div className="absolute inset-y-0 left-0 rounded-sm bg-navy-200" style={{ width: `${planned}%` }} />
      <div className={cn('absolute inset-y-0.5 left-0 rounded-sm', behind ? 'bg-navy-700' : 'bg-navy-900')} style={{ width: `${actual}%` }} />
      {/* Orange datum marks where the baseline says work should be today. */}
      <div className="absolute -top-1 -bottom-1 w-0.5 bg-accent-500" style={{ left: `calc(${planned}% - 1px)` }} />
    </div>
  );
}

export default function ScheduleHealth({ projects }) {
  return (
    <Card>
      <CardHeader
        icon={CalendarRange}
        title="Schedule health"
        description="Physical progress against baseline for each active project."
        actions={
          <div className="hidden items-center gap-4 text-xs text-muted sm:flex">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-navy-900" aria-hidden="true" /> Actual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-navy-200" aria-hidden="true" /> Planned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-0.5 bg-accent-500" aria-hidden="true" /> Baseline today
            </span>
          </div>
        }
      />
      <ul className="divide-y divide-line">
        {projects.map((project) => {
          const variance = project.actual - project.planned;
          return (
            <li key={project.code} className="grid gap-3 px-5 py-3.5 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)_88px_104px] md:items-center md:gap-6">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{project.name}</p>
                <p className="truncate text-xs text-muted">
                  {project.code}, {project.location}. Finish {formatDate(project.finish)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <ProgressTrack planned={project.planned} actual={project.actual} />
                <span className="tabular w-10 shrink-0 text-right text-sm font-semibold text-ink">{project.actual}%</span>
              </div>
              <p className={cn('tabular text-sm font-medium md:text-right', variance < 0 ? 'text-danger-700' : 'text-success-700')}>
                {variance > 0 ? '+' : ''}
                {variance} pts
              </p>
              <div className="md:text-right">
                <StatusBadge status={project.status} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
