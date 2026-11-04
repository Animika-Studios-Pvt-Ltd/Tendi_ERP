import { forwardRef } from 'react';
import { cn } from '@/utils/cn';
import { fieldBase, fieldState } from './Input';

const Textarea = forwardRef(function Textarea({ className, invalid, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, fieldState(invalid), 'px-3 py-2 leading-relaxed', className)}
      {...props}
    />
  );
});

export default Textarea;
