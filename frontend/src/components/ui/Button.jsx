import { forwardRef } from 'react';
import { cn } from '@/utils/cn';
import Spinner from './Spinner';

const VARIANTS = {
  primary: 'bg-navy-900 text-white hover:bg-navy-800 active:bg-navy-950 disabled:bg-navy-300',
  accent: 'bg-accent-500 text-navy-900 hover:bg-accent-400 active:bg-accent-600 disabled:bg-accent-200',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-navy-50 hover:border-navy-300 active:bg-navy-100 disabled:text-subtle',
  ghost: 'text-navy-700 hover:bg-navy-100 active:bg-navy-200 disabled:text-subtle',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 disabled:opacity-50',
};

const SIZES = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-md',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg',
  icon: 'h-9 w-9 rounded-md',
  'icon-sm': 'h-8 w-8 rounded-md',
};

const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, leftIcon: LeftIcon, rightIcon: RightIcon, className, children, disabled, type = 'button', ...props },
  ref,
) {
  const iconSize = size === 'sm' || size === 'icon-sm' ? 14 : 16;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={iconSize} /> : LeftIcon && <LeftIcon size={iconSize} aria-hidden="true" />}
      {children}
      {!loading && RightIcon && <RightIcon size={iconSize} aria-hidden="true" />}
    </button>
  );
});

export default Button;
