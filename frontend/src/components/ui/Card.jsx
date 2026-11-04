import { cn } from '@/utils/cn';

export function Card({ as: Component = 'section', className, children, ...props }) {
  return (
    <Component className={cn('rounded-lg border border-line bg-surface shadow-card', className)} {...props}>
      {children}
    </Component>
  );
}

export function CardHeader({ title, description, actions, className, icon: Icon }) {
  return (
    <header className={cn('flex items-start justify-between gap-4 border-b border-line px-5 py-3.5', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && <Icon size={16} className="mt-0.5 shrink-0 text-navy-500" aria-hidden="true" />}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function CardBody({ className, children }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

export function CardFooter({ className, children }) {
  return <footer className={cn('flex items-center justify-end gap-2 border-t border-line px-5 py-3', className)}>{children}</footer>;
}
