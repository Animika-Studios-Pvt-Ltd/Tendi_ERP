import { forwardRef } from 'react';
import { cn } from '@/utils/cn';

export const fieldBase =
  'block w-full rounded-md border bg-surface text-sm text-ink placeholder:text-subtle transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-navy-50 disabled:text-muted';

export const fieldState = (invalid) =>
  invalid
    ? 'border-danger-600 focus:border-danger-600 focus:ring-danger-600/15'
    : 'border-line-strong hover:border-navy-300 focus:border-navy-600 focus:ring-navy-600/15';

const Input = forwardRef(function Input({ className, invalid, leftIcon: LeftIcon, rightSlot, size = 'md', ...props }, ref) {
  const height = size === 'sm' ? 'h-8' : size === 'lg' ? 'h-11' : 'h-9';
  return (
    <div className="relative">
      {LeftIcon && (
        <LeftIcon size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" aria-hidden="true" />
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(fieldBase, fieldState(invalid), height, LeftIcon ? 'pl-9' : 'pl-3', rightSlot ? 'pr-10' : 'pr-3', className)}
        {...props}
      />
      {rightSlot && <div className="absolute inset-y-0 right-1 flex items-center">{rightSlot}</div>}
    </div>
  );
});

export default Input;
