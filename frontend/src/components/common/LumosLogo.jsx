import { cn } from '@/utils/cn';

export function LumosMark({ size = 28, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn('shrink-0', className)}>
      <rect width="32" height="32" rx="7" fill="#1D3149" />
      <path d="M9 7v18h14" stroke="#F59E0B" strokeWidth="3.2" strokeLinecap="square" />
      <path d="M15 19V7l8 5v7" stroke="#FFFFFF" strokeWidth="2.4" />
    </svg>
  );
}

export default function LumosLogo({ collapsed = false, tone = 'light', className }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LumosMark />
      {!collapsed && (
        <span className="leading-none">
          <span
            className={cn('block font-display text-[17px] font-bold tracking-tight', tone === 'light' ? 'text-white' : 'text-navy-900')}
            style={{ fontVariationSettings: "'wdth' 88" }}
          >
            Ten.Di
          </span>
          <span className={cn('mt-0.5 block text-2xs', tone === 'light' ? 'text-navy-300' : 'text-muted')}>ERP</span>
        </span>
      )}
    </span>
  );
}
