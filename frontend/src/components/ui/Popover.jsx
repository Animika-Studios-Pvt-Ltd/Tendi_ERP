import { useCallback, useId, useRef, useState } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { cn } from '@/utils/cn';

/**
 * Minimal disclosure popover for top-bar menus.
 * trigger: ({ open, toggle, props }) => element; spread `props` on the trigger button.
 * children: element or ({ close }) => element.
 */
export default function Popover({ trigger, children, align = 'end', width = 'w-72', className, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);

  useClickOutside(ref, close, open);

  return (
    <div ref={ref} className="relative">
      {trigger({
        open,
        toggle: () => setOpen((value) => !value),
        props: { 'aria-expanded': open, 'aria-controls': id, 'aria-haspopup': 'dialog', onClick: () => setOpen((v) => !v) },
      })}
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={cn(
            'absolute top-full z-50 mt-2 overflow-hidden rounded-lg border border-line bg-surface shadow-raised',
            align === 'end' ? 'right-0' : 'left-0',
            width,
            className,
          )}
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}
