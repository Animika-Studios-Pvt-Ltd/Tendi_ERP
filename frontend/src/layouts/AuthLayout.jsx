import { Navigate, Outlet } from 'react-router-dom';
import LumosLogo from '@/components/common/LumosLogo';
import PageLoader from '@/components/common/PageLoader';
import SystemStatus from '@/components/common/SystemStatus';
import { useAuth } from '@/hooks/useAuth';

const COVERAGE = ['Projects & sites', 'Procurement & stock', 'Budgets & billing', 'Labour & contractors', 'Quality & safety'];

export default function AuthLayout() {
  const { status } = useAuth();

  if (status === 'loading') return <PageLoader label="Checking your session" />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="blueprint-grid relative hidden flex-col justify-between overflow-hidden bg-navy-900 p-10 lg:flex xl:p-14">
        <LumosLogo />

        <div className="max-w-md">
          <h1
            className="text-[2.5rem] leading-[1.05] font-bold text-white"
            style={{ fontVariationSettings: "'wdth' 82" }}
          >
            Every site, every rupee, every approval in one place.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-navy-200">
            Ten.Di ERP connects your project teams, stores, accounts and contractors so work moves from request to approval without the paper chase.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {COVERAGE.map((item) => (
              <li key={item} className="rounded-full border border-navy-600 px-3 py-1 text-xs text-navy-200">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between text-xs text-navy-400">
          <span>© {new Date().getFullYear()} Ten.Di ERP</span>
          <SystemStatus />
        </div>

        {/* Survey-mark motif: an orange datum line along the panel edge. */}
        <span className="absolute top-0 right-0 bottom-0 w-1 bg-accent-500" aria-hidden="true" />
      </aside>

      <main className="flex flex-col px-6 py-10 sm:px-10">
        <div className="mb-10 lg:hidden">
          <LumosLogo tone="dark" />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </div>
        <SystemStatus variant="light" className="mt-10 justify-center lg:hidden" />
      </main>
    </div>
  );
}
