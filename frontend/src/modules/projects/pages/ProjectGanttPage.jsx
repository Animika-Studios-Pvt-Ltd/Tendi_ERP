import { useCallback, useEffect, useState } from 'react';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import { Card, CardBody } from '@/components/ui/Card';
import Select from '@/components/ui/Select';
import { useWorkingProjectFilter } from '@/hooks/useWorkingProjectFilter';
import { projectsService } from '@/services/projects.service';
import GanttTimeline from '../components/GanttTimeline';

export default function ProjectGanttPage() {
  const [selectedId, setSelectedId] = useWorkingProjectFilter();
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState('');
  const [gantt, setGantt] = useState(null);
  const [wbs, setWbs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    projectsService
      .list({ limit: 100, sort: 'name' })
      .then(({ data }) => {
        const list = data || [];
        setProjects(list);
        if (!activeProject && list.length > 0) {
          setActiveProject(selectedId || list[0].id);
        }
      })
      .catch(() => {});
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) setActiveProject(selectedId);
  }, [selectedId]);

  const loadSchedule = useCallback(async () => {
    if (!activeProject) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [gRes, wRes] = await Promise.all([
        projectsService.getGantt(activeProject),
        projectsService.getWbs(activeProject),
      ]);
      setGantt(gRes.data);
      setWbs(wRes.data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  return (
    <>
      <PageHeader
        title="Schedule & Gantt"
        description="WBS hierarchy, task dependencies, milestones and baseline variance across your project."
        actions={
          <div className="w-64">
            <Select
              aria-label="Select project"
              value={activeProject}
              onChange={(e) => {
                setActiveProject(e.target.value);
                setSelectedId(e.target.value);
              }}
              placeholder="Select project..."
              options={projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
            />
          </div>
        }
      />

      {loading ? (
        <PageLoader label="Loading project schedule..." />
      ) : error ? (
        <ErrorState error={error} onRetry={loadSchedule} />
      ) : !activeProject ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-muted">
            Create or select a project to inspect its WBS and Gantt timeline.
          </CardBody>
        </Card>
      ) : (
        <GanttTimeline gantt={gantt} wbs={wbs} />
      )}
    </>
  );
}

