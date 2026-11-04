import { createContext, useMemo } from 'react';
import { STORAGE_KEYS } from '@/constants/app';
import { useLocalStorage } from '@/hooks/useLocalStorage';

export const ProjectContext = createContext(null);

export const ALL_PROJECTS = 'all';

/**
 * Holds the project the user is working in. Modules read selectedProjectId to
 * scope their API queries. `projects` is populated once the Project Management
 * API exists (Phase 2); until then only "All projects" is available.
 */
export function ProjectProvider({ children }) {
  const [selectedProjectId, setSelectedProjectId] = useLocalStorage(STORAGE_KEYS.SELECTED_PROJECT, ALL_PROJECTS);

  const value = useMemo(
    () => ({
      projects: [],
      projectsLoading: false,
      selectedProjectId,
      selectedProject: null,
      selectProject: setSelectedProjectId,
    }),
    [selectedProjectId, setSelectedProjectId],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
