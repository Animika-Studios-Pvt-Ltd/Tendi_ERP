import { cn } from '@/utils/cn';
import { initials } from '@/utils/format';

const SIZES = { sm: 'h-7 w-7 text-2xs', md: 'h-8 w-8 text-xs', lg: 'h-12 w-12 text-base' };

export default function Avatar({ name, src, size = 'md', className }) {
  if (src) {
    return <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-navy-100 font-semibold text-navy-800 ring-1 ring-navy-200',
        SIZES[size],
        className,
      )}
    >
      {initials(name) || '?'}
    </span>
  );
}
