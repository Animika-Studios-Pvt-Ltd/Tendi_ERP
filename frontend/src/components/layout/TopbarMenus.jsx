import { Bell, ClipboardCheck, LogOut, Settings, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import EmptyState from '@/components/common/EmptyState';
import Avatar from '@/components/ui/Avatar';
import Popover from '@/components/ui/Popover';
import { MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/utils/cn';

function IconTrigger({ icon: Icon, label, count = 0, open, props }) {
  return (
    <button
      type="button"
      aria-label={count ? `${label} (${count})` : label}
      title={label}
      {...props}
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-md text-navy-600 transition-colors hover:bg-navy-50 hover:text-navy-900',
        open && 'bg-navy-50 text-navy-900',
      )}
    >
      <Icon size={18} strokeWidth={1.75} />
      {count > 0 && (
        <span className="tabular absolute top-1 right-1 min-w-4 rounded-full bg-accent-500 px-1 text-center text-[10px] leading-4 font-semibold text-navy-900">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

function PanelHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {action}
    </div>
  );
}

/** Wired to the Notification model in a later phase; renders the empty state until then. */
export function NotificationsMenu({ notifications = [] }) {
  return (
    <Popover
      label="Notifications"
      width="w-80"
      trigger={(state) => <IconTrigger icon={Bell} label="Notifications" count={notifications.length} {...state} />}
    >
      <PanelHeader title="Notifications" />
      <EmptyState compact icon={Bell} title="You're all caught up" description="Alerts about approvals, stock and site issues will show up here." />
    </Popover>
  );
}

/** Aggregates items waiting on the user's approval across workflow modules. */
export function ApprovalsMenu({ approvals = [] }) {
  return (
    <Popover
      label="Pending approvals"
      width="w-80"
      trigger={(state) => <IconTrigger icon={ClipboardCheck} label="Pending approvals" count={approvals.length} {...state} />}
    >
      <PanelHeader title="Pending approvals" />
      <EmptyState
        compact
        icon={ClipboardCheck}
        title="Nothing waiting on you"
        description="Material requests, expenses, progress reports and bills that need your approval will be listed here."
      />
    </Popover>
  );
}

export function UserMenu() {
  const { user, logout, can } = useAuth();

  return (
    <Popover
      label="Account"
      width="w-64"
      trigger={({ open, props }) => (
        <button
          type="button"
          {...props}
          aria-label="Account menu"
          className={cn('flex items-center gap-2.5 rounded-md py-1 pr-2 pl-1 transition-colors hover:bg-navy-50', open && 'bg-navy-50')}
        >
          <Avatar name={user?.fullName} src={user?.avatarUrl} />
          <span className="hidden text-left leading-tight xl:block">
            <span className="block max-w-36 truncate text-sm font-medium text-ink">{user?.fullName}</span>
            <span className="block max-w-36 truncate text-xs text-muted">{user?.role?.name}</span>
          </span>
        </button>
      )}
    >
      {({ close }) => (
        <div>
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{user?.fullName}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
          </div>
          <ul className="py-1 text-sm">
            <li>
              <Link to="/profile" onClick={close} className="flex items-center gap-2.5 px-4 py-2 text-ink hover:bg-navy-50">
                <UserRound size={16} className="text-navy-500" /> My profile
              </Link>
            </li>
            {can(MODULES.SETTINGS, 'read') && (
              <li>
                <Link to="/settings" onClick={close} className="flex items-center gap-2.5 px-4 py-2 text-ink hover:bg-navy-50">
                  <Settings size={16} className="text-navy-500" /> Settings
                </Link>
              </li>
            )}
          </ul>
          <div className="border-t border-line py-1">
            <button type="button" onClick={logout} className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-danger-700 hover:bg-danger-50">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
