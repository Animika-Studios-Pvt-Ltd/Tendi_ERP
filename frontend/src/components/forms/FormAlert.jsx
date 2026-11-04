import { CircleAlert, CircleCheck } from 'lucide-react';
import { cn } from '@/utils/cn';

export default function FormAlert({ tone = 'danger', children, className }) {
  if (!children) return null;
  const Icon = tone === 'success' ? CircleCheck : CircleAlert;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm',
        tone === 'success' ? 'border-success-600/25 bg-success-50 text-success-700' : 'border-danger-600/25 bg-danger-50 text-danger-700',
        className,
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
