import { RefreshCw, TriangleAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
import { cn } from '@/utils/cn';

export default function ErrorState({ title = 'This section could not load', error, onRetry, className }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-danger-50 text-danger-600 ring-1 ring-danger-600/20">
        <TriangleAlert size={18} aria-hidden="true" />
      </span>
      <p className="font-medium text-ink">{title}</p>
      {error?.message && <p className="mt-1 max-w-md text-sm text-muted">{error.message}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" leftIcon={RefreshCw} onClick={onRetry} className="mt-4">
          Try again
        </Button>
      )}
    </div>
  );
}
