import { LogOut, Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import LumosLogo, { LumosMark } from '@/components/common/LumosLogo';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/utils/cn';
import GlobalSearch from './GlobalSearch';
import ProjectSelector from './ProjectSelector';
import { ApprovalsMenu, NotificationsMenu, UserMenu } from './TopbarMenus';

export default function Topbar({ sidebarCollapsed, onOpenMobileNav }) {
  const { logout } = useAuth();

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-stretch border-b border-line bg-surface">
      {/* Navy block continues the sidebar so the shell reads as one frame. */}
      <div
        className={cn(
          'hidden shrink-0 items-center bg-navy-900 transition-[width] duration-200 lg:flex',
          sidebarCollapsed ? 'w-[68px] justify-center' : 'w-[260px] px-5',
        )}
      >
        <Link to="/dashboard" aria-label="Ten.Di ERP home">
          <LumosLogo collapsed={sidebarCollapsed} />
        </Link>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 px-3 sm:px-5">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-navy-700 hover:bg-navy-50 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <Link to="/dashboard" className="lg:hidden" aria-label="Ten.Di ERP home">
          <LumosMark />
        </Link>

        <div className="hidden flex-1 items-center gap-3 md:flex">
          <GlobalSearch />
          <ProjectSelector />
        </div>
        <div className="flex-1 md:hidden" />

        <div className="flex items-center gap-1">
          <ApprovalsMenu />
          <NotificationsMenu />
          <span className="mx-1.5 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
          <UserMenu />
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="hidden h-9 w-9 items-center justify-center rounded-md text-navy-600 hover:bg-danger-50 hover:text-danger-700 sm:inline-flex"
          >
            <LogOut size={18} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </header>
  );
}
