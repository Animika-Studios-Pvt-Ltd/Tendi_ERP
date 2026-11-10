import { useEffect, useState } from 'react';
import { ALL_PROJECTS } from '@/context/ProjectContext';
import { useProject } from '@/hooks/useProject';

/**
 * Initializes and keeps a local page project filter synced with the Topbar
 * working project selector (ProjectSelector).
 */
export function useWorkingProjectFilter() {
  const { selectedProjectId } = useProject();
  const initial = selectedProjectId && selectedProjectId !== ALL_PROJECTS ? selectedProjectId : '';
  const [projectFilter, setProjectFilter] = useState(initial);

  useEffect(() => {
    setProjectFilter(selectedProjectId && selectedProjectId !== ALL_PROJECTS ? selectedProjectId : '');
  }, [selectedProjectId]);

  return [projectFilter, setProjectFilter];
}

