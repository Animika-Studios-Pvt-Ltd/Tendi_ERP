import { ChevronRight, House } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { findRoute } from '@/modules/registry';

/** Builds the trail from the URL using titles in the module registry. */
export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  const crumbs = segments
    .map((_, index) => {
      const path = `/${segments.slice(0, index + 1).join('/')}`;
      return { path, title: findRoute(path)?.title };
    })
    .filter((crumb) => crumb.title);

  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
        <li>
          <Link to="/dashboard" className="inline-flex items-center rounded p-0.5 hover:text-ink" aria-label="Dashboard">
            <House size={13} />
          </Link>
        </li>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-1">
              <ChevronRight size={12} className="text-subtle" aria-hidden="true" />
              {last ? (
                <span aria-current="page" className="font-medium text-ink">
                  {crumb.title}
                </span>
              ) : (
                <Link to={crumb.path} className="hover:text-ink">
                  {crumb.title}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
