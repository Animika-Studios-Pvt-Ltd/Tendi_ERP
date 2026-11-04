import { ChevronDown } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/utils/cn';
import { fieldBase, fieldState } from './Input';

const Select = forwardRef(function Select({ className, invalid, options = [], placeholder, size = 'md', ...props }, ref) {
  const height = size === 'sm' ? 'h-8' : 'h-9';
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(fieldBase, fieldState(invalid), height, 'appearance-none pr-9 pl-3', className)}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" aria-hidden="true" />
    </div>
  );
});

export default Select;
