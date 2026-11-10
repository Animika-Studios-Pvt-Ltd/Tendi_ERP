import { Bell, CheckCheck, ClipboardCheck, LogOut, Settings, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import EmptyState from '@/components/common/EmptyState';
import StatusBadge from '@/components/common/StatusBadge';
import Avatar from '@/components/ui/Avatar';
import Popover from '@/components/ui/Popover';
import { MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { notificationsService } from '@/services/notifications.service';
import { cn } from '@/utils/cn';
import { formatCurrencyCompact, formatDateTime } from '@/utils/format';

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

export function NotificationsMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const res = await notificationsService.list({ limit: 10 });
      setItems(res.data || []);
      setUnreadCount(res.meta?.unreadCount ?? 0);
    } catch {
      // ignore silent poll errors
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, [refresh]);

  const handleMarkRead = async (item, close) => {
    if (!item.isRead) {
      notificationsService.markRead(item.id).then(refresh).catch(() => {});
    }
    if (item.link) {
      close();
      navigate(item.link);
    }
  };

  const handleMarkAll = async () => {
    try {
      await notificationsService.markAllRead();
      refresh();
    } catch {
      // ignore
    }
  };

  return (
    <Popover
      label="Notifications"
      width="w-80 sm:w-96"
      trigger={(state) => <IconTrigger icon={Bell} label="Notifications" count={unreadCount} {...state} />}
    >
      {({ close }) => (
        <div>
          <PanelHeader
            title="Notifications"
            action={
              unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  className="inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:underline"
                >
                  <CheckCheck size={14} /> Mark all read
                </button>
              )
            }
          />
          {items.length === 0 ? (
            <EmptyState
              compact
              icon={Bell}
              title="You're all caught up"
              description="Alerts about approvals, stock and site issues will show up here."
            />
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleMarkRead(item, close)}
                    className={cn(
                      'block w-full px-4 py-2.5 text-left transition-colors hover:bg-navy-50/70',
                      !item.isRead && 'bg-accent-50/30',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('text-xs font-medium text-ink', !item.isRead && 'font-semibold')}>
                        {item.title}
                      </p>
                      {!item.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent-500" />}
                    </div>
                    {item.message && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.message}</p>}
                    <p className="mt-1 text-[11px] text-subtle">{formatDateTime(item.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}

/** Aggregates items waiting on the user's approval across workflow modules. */
export function ApprovalsMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [approvals, setApprovals] = useState([]);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const res = await notificationsService.pendingApprovals();
      setApprovals(res.data || []);
    } catch {
      // ignore silent poll errors
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <Popover
      label="Pending approvals"
      width="w-80 sm:w-96"
      trigger={(state) => (
        <IconTrigger icon={ClipboardCheck} label="Pending approvals" count={approvals.length} {...state} />
      )}
    >
      {({ close }) => (
        <div>
          <PanelHeader title="Pending approvals" action={<span className="text-xs text-muted">{approvals.length} waiting</span>} />
          {approvals.length === 0 ? (
            <EmptyState
              compact
              icon={ClipboardCheck}
              title="Nothing waiting on you"
              description="Material requests, expenses, progress reports and bills that need your approval will be listed here."
            />
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {approvals.map((item) => (
                <li key={`${item.module}-${item.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      if (item.link) navigate(item.link);
                    }}
                    className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-navy-50/70"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-ink">{item.title}</p>
                      {item.amount != null && (
                        <span className="tabular shrink-0 text-xs font-semibold text-ink">
                          {formatCurrencyCompact(item.amount)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {item.type} · {item.project}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-subtle">
                        From {item.requestedBy || 'User'}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
            <button
              type="button"
              onClick={() => {
                close();
                logout();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-danger-700 hover:bg-danger-50"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
