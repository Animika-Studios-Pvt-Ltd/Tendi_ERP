import { cn } from '@/utils/cn';

export default function ProgressBar({ value = 0, className }) {
  const percent = Math.min(Math.max(Number(value) || 0, 0), 100);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progress"
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-100"
      >
        <div className="h-full rounded-full bg-navy-700" style={{ width: `${percent}%` }} />
      </div>
      <span className="tabular w-9 text-right text-xs text-muted">{percent}%</span>
    </div>
  );
}
