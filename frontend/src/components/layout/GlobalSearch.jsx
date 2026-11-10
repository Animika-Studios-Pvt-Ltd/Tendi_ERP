import { CornerDownLeft, FileSearch, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ROUTE_INDEX } from '@/modules/registry';
import { searchService } from '@/services/search.service';
import { cn } from '@/utils/cn';

/**
 * Quick navigation across modules, pages and live ERP records (Ctrl/⌘ + K).
 */
export default function GlobalSearch() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  useClickOutside(containerRef, close, open);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setRecords([]);
      setLoadingRecords(false);
      return;
    }
    let cancelled = false;
    setLoadingRecords(true);
    searchService
      .search(debouncedQuery)
      .then((res) => {
        if (!cancelled) setRecords(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRecords(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const pageResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return ROUTE_INDEX.filter((route) => !route.hidden && can(route.module.permission, 'read'))
      .filter((route) => `${route.title} ${route.module.title}`.toLowerCase().includes(term))
      .slice(0, 5)
      .map((route) => ({
        kind: 'page',
        key: `page:${route.path}`,
        path: route.path,
        title: route.title,
        subtitle: route.section ? route.module.title : 'Module',
        icon: route.module.icon,
      }));
  }, [query, can]);

  const recordResults = useMemo(
    () =>
      records.map((rec) => ({
        kind: 'record',
        key: `rec:${rec.type}:${rec.id}`,
        path: rec.link,
        title: rec.title,
        subtitle: `${rec.type} · ${rec.subtitle}`,
        icon: FileSearch,
      })),
    [records],
  );

  const results = useMemo(() => [...pageResults, ...recordResults], [pageResults, recordResults]);

  const go = (item) => {
    navigate(item.path);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && results[activeIndex]) {
      go(results[activeIndex]);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="global-search-results"
        aria-label="Search modules, pages and records"
        placeholder="Search modules, projects, POs, sites..."
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-md border border-line bg-canvas pr-14 pl-9 text-sm text-ink placeholder:text-subtle hover:border-line-strong focus:border-navy-600 focus:bg-surface focus:ring-2 focus:ring-navy-600/15 focus:outline-none"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-2xs text-muted sm:block">
        Ctrl K
      </kbd>

      {open && query.trim() && (
        <div className="absolute top-full right-0 left-0 z-50 mt-2 max-h-96 overflow-y-auto rounded-lg border border-line bg-surface shadow-raised">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">
              {loadingRecords ? 'Searching ERP records...' : `No pages or records match "${query}".`}
            </p>
          ) : (
            <ul id="global-search-results" role="listbox" className="py-1">
              {results.map((item, index) => {
                const Icon = item.icon;
                return (
                  <li key={item.key} role="option" aria-selected={index === activeIndex}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(item)}
                      className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', index === activeIndex && 'bg-navy-50')}
                    >
                      <Icon size={16} className="shrink-0 text-navy-500" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{item.title}</span>
                        <span className="block truncate text-xs text-muted">{item.subtitle}</span>
                      </span>
                      {index === activeIndex && <CornerDownLeft size={14} className="text-subtle" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
