import { Search } from 'lucide-react';
import Input from '@/components/ui/Input';

/** Search box plus a slot for filter controls, rendered above a DataTable. */
export default function TableToolbar({ search, onSearchChange, searchPlaceholder = 'Search', children, actions }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {onSearchChange && (
          <div className="w-full sm:max-w-xs">
            <Input
              size="sm"
              leftIcon={Search}
              type="search"
              value={search}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        )}
        {children}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
