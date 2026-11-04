import { Building2, Check, ChevronDown } from 'lucide-react';
import EmptyState from '@/components/common/EmptyState';
import Popover from '@/components/ui/Popover';
import { ALL_PROJECTS } from '@/context/ProjectContext';
import { useProject } from '@/hooks/useProject';
import { cn } from '@/utils/cn';

export default function ProjectSelector() {
  const { projects, selectedProjectId, selectedProject, selectProject } = useProject();
  const label = selectedProjectId === ALL_PROJECTS || !selectedProject ? 'All projects' : selectedProject.name;

  return (
    <Popover
      label="Select project"
      align="start"
      width="w-80"
      trigger={({ open, props }) => (
        <button
          type="button"
          {...props}
          className={cn(
            'flex h-9 max-w-56 items-center gap-2 rounded-md border px-3 text-sm transition-colors',
            open ? 'border-navy-600 bg-surface' : 'border-line bg-surface hover:border-line-strong',
          )}
        >
          <Building2 size={16} className="shrink-0 text-navy-500" aria-hidden="true" />
          <span className="truncate font-medium text-ink">{label}</span>
          <ChevronDown size={14} className="shrink-0 text-muted" aria-hidden="true" />
        </button>
      )}
    >
      {({ close }) => (
        <div>
          <div className="border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold text-ink">Working project</p>
            <p className="text-xs text-muted">Lists and reports are filtered to this project.</p>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {[{ id: ALL_PROJECTS, name: 'All projects', code: null }, ...projects].map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => {
                    selectProject(project.id);
                    close();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-navy-50"
                >
                  <span className="min-w-0 flex-1 truncate text-ink">{project.name}</span>
                  {project.code && <span className="text-xs text-muted">{project.code}</span>}
                  {selectedProjectId === project.id && <Check size={14} className="text-navy-700" />}
                </button>
              </li>
            ))}
          </ul>
          {projects.length === 0 && (
            <EmptyState compact title="No projects yet" description="Projects you are assigned to will appear here once Project Management is set up." />
          )}
        </div>
      )}
    </Popover>
  );
}
