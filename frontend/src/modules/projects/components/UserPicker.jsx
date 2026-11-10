import { Search } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Avatar from '@/components/ui/Avatar';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { projectsService } from '@/services/projects.service';
import { cn } from '@/utils/cn';

/** Searches active users (name or email) and calls onSelect with the chosen person. */
export default function UserPicker({ onSelect, excludeIds = [], forProjectManager = false, placeholder = 'Search people by name or email', disabled, id, ...inputProps }) {
  const listId = useId();
  const containerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const q = useDebouncedValue(query.trim(), 250);

  const close = useCallback(() => setOpen(false), []);
  useClickOutside(containerRef, close, open);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    projectsService
      .lookupUsers(forProjectManager ? { q, forProjectManager: true } : { q })
      .then(({ data }) => !cancelled && setResults(data))
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, open, forProjectManager]);

  const visible = results.filter((person) => !excludeIds.includes(person.id));

  const choose = (person) => {
    onSelect(person);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        leftIcon={Search}
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        {...inputProps}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-raised"
        >
          {loading && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted">
              <Spinner size={14} /> Searching…
            </li>
          )}
          {!loading && error && <li className="px-3 py-2 text-sm text-danger-700">{error.message}</li>}
          {!loading && !error && visible.length === 0 && <li className="px-3 py-2 text-sm text-muted">No matching active users</li>}
          {!loading &&
            !error &&
            visible.map((person) => (
              <li key={person.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => choose(person)}
                  className={cn('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-navy-50')}
                >
                  <Avatar name={person.fullName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{person.fullName}</span>
                    <span className="block truncate text-xs text-muted">
                      {person.role?.name ?? 'No role'} · {person.email}
                    </span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
