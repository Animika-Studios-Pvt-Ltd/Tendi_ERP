import { LoaderCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

export default function Spinner({ size = 16, className, label }) {
  return (
    <span role={label ? 'status' : undefined} className={cn('inline-flex items-center gap-2', className)}>
      <LoaderCircle size={size} className="animate-spin" aria-hidden="true" />
      {label && <span className="text-sm text-muted">{label}</span>}
    </span>
  );
}
