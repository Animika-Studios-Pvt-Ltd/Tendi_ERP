import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { STORAGE_KEYS } from '@/constants/app';
import { MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { projectsService } from '@/services/projects.service';

export const ProjectContext = createContext(null);

export const ALL_PROJECTS = 'all';

const SELECTOR_LIMIT = 100;

/**
 * Holds the project the user is working in. Modules read selectedProjectId to scope their
 * API queries. The list contains only projects the API lets this user see.
 */
export function ProjectProvider({ children }) {
  const { user, can } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useLocalStorage(STORAGE_KEYS.SELECTED_PROJECT, ALL_PROJECTS);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const canRead = Boolean(user) && can(MODULES.PROJECTS, 'read');

  const refreshProjects = useCallback(async () => {
    if (!canRead) {
      setProjects([]);
      return;
    }
    setProjectsLoading(true);
    try {
      const { data } = await projectsService.list({ limit: SELECTOR_LIMIT, sort: 'name' });
      setProjects(data.map(({ id, name, code, status }) => ({ id, name, code, status })));
    } catch {
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects, user?.id]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  // A remembered project the user can no longer see falls back to "All projects".
  useEffect(() => {
    if (!projectsLoading && selectedProjectId !== ALL_PROJECTS && projects.length > 0 && !selectedProject) {
      setSelectedProjectId(ALL_PROJECTS);
    }
  }, [projects, projectsLoading, selectedProject, selectedProjectId, setSelectedProjectId]);

  const value = useMemo(
    () => ({ projects, projectsLoading, selectedProjectId, selectedProject, selectProject: setSelectedProjectId, refreshProjects }),
    [projects, projectsLoading, selectedProjectId, selectedProject, setSelectedProjectId, refreshProjects],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
