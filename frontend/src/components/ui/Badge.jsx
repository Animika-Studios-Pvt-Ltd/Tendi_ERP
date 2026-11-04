import { cn } from '@/utils/cn';

const TONES = {
  neutral: 'bg-navy-50 text-navy-700 ring-navy-200',
  info: 'bg-info-50 text-info-700 ring-info-600/20',
  success: 'bg-success-50 text-success-700 ring-success-600/20',
  warning: 'bg-warning-50 text-warning-700 ring-warning-600/25',
  danger: 'bg-danger-50 text-danger-700 ring-danger-600/20',
  accent: 'bg-accent-100 text-navy-900 ring-accent-500/40',
};

const DOTS = {
  neutral: 'bg-navy-400',
  info: 'bg-info-600',
  success: 'bg-success-600',
  warning: 'bg-warning-600',
  danger: 'bg-danger-600',
  accent: 'bg-accent-500',
};

export default function Badge({ tone = 'neutral', dot = false, className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone])} aria-hidden="true" />}
      {children}
    </span>
  );
}
