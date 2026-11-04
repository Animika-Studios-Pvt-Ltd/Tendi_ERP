import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import SystemStatus from '@/components/common/SystemStatus';
import { useAuth } from '@/hooks/useAuth';
import { MODULE_REGISTRY, NAV_GROUPS, sectionPath } from '@/modules/registry';
import { cn } from '@/utils/cn';

function isWithin(pathname, base) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function NavItem({ module, collapsed, pathname, expanded, onToggle, onNavigate }) {
  const Icon = module.icon;
  const sections = module.sections ?? [];
  const hasChildren = sections.length > 1 && !collapsed;
  const active = isWithin(pathname, module.path);

  const rowClass = cn(
    'group relative flex h-9 min-w-0 flex-1 items-center gap-3 rounded-md text-[13px] font-medium transition-colors',
    collapsed ? 'justify-center px-0' : 'px-3',
    active ? 'bg-navy-800 text-white' : 'text-navy-200 hover:bg-navy-800/60 hover:text-white',
  );

  const marker = active && <span className="absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r bg-accent-500" aria-hidden="true" />;

  return (
    <li>
      <div className="flex items-center">
        <NavLink to={module.path} end={!hasChildren} title={collapsed ? module.title : undefined} onClick={onNavigate} className={rowClass}>
          {marker}
          <Icon size={18} strokeWidth={1.75} className={cn('shrink-0', active ? 'text-accent-400' : 'text-navy-300 group-hover:text-white')} aria-hidden="true" />
          {!collapsed && <span className="truncate">{module.title}</span>}
          {collapsed && <span className="sr-only">{module.title}</span>}
        </NavLink>
        {hasChildren && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${module.title}`}
            className="ml-1 inline-flex h-9 w-7 shrink-0 items-center justify-center rounded-md text-navy-300 hover:bg-navy-800/60 hover:text-white"
          >
            <ChevronDown size={15} className={cn('transition-transform', expanded ? 'rotate-0' : '-rotate-90')} />
          </button>
        )}
      </div>

      {hasChildren && expanded && (
        <ul className="mt-0.5 mb-1 ml-[21px] space-y-0.5 border-l border-navy-700 pl-3">
          {sections.map((section) => {
            const to = sectionPath(module, section);
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'block truncate rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                      isActive ? 'bg-navy-800/80 font-medium text-white' : 'text-navy-300 hover:text-white',
                    )
                  }
                >
                  {section.title}
                </NavLink>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export default function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }) {
  const { can } = useAuth();
  const { pathname } = useLocation();

  const groups = useMemo(() => {
    const visible = MODULE_REGISTRY.filter((module) => can(module.permission, 'read'));
    return NAV_GROUPS.map((group) => ({ ...group, modules: visible.filter((m) => m.group === group.key) })).filter(
      (group) => group.modules.length > 0,
    );
  }, [can]);

  const [expandedKey, setExpandedKey] = useState(() => MODULE_REGISTRY.find((m) => isWithin(pathname, m.path))?.key ?? null);

  useEffect(() => {
    const current = MODULE_REGISTRY.find((m) => isWithin(pathname, m.path));
    if (current) setExpandedKey(current.key);
  }, [pathname]);

  // The drawer on small screens is always shown expanded.
  const isCollapsed = collapsed && !mobileOpen;

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-navy-950/50 lg:hidden" onClick={onCloseMobile} aria-hidden="true" />}
      <aside
        aria-label="Main navigation"
        className={cn(
          'fixed top-14 bottom-0 left-0 z-40 flex flex-col bg-navy-900 transition-[width,transform] duration-200',
          isCollapsed ? 'w-[68px]' : 'w-[260px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <nav className="flex-1 overflow-y-auto px-3 pt-3 pb-4 [scrollbar-width:thin] [scrollbar-color:var(--color-navy-700)_transparent]">
          {groups.map((group) => (
            <div key={group.key} className="mb-3">
              {group.label && !isCollapsed && <p className="mb-1 px-3 pt-2 text-2xs font-medium text-navy-400">{group.label}</p>}
              {group.label && isCollapsed && <hr className="mx-2 my-2 border-navy-800" />}
              <ul className="space-y-0.5">
                {group.modules.map((module) => (
                  <NavItem
                    key={module.key}
                    module={module}
                    collapsed={isCollapsed}
                    pathname={pathname}
                    expanded={expandedKey === module.key}
                    onToggle={() => setExpandedKey((key) => (key === module.key ? null : module.key))}
                    onNavigate={onCloseMobile}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={cn('flex items-center border-t border-navy-800 py-3', isCollapsed ? 'flex-col gap-3 px-2' : 'justify-between gap-2 px-4')}>
          <SystemStatus collapsed={isCollapsed} />
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-navy-300 hover:bg-navy-800 hover:text-white lg:inline-flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
      </aside>
    </>
  );
}
