import { ArrowLeft, CalendarRange, MapPin, Pencil, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { projectsService } from '@/services/projects.service';
import { formatCurrency, formatDate } from '@/utils/format';
import ProgressBar from '../components/ProgressBar';
import TeamCard from '../components/TeamCard';

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-ink">{children || '—'}</dd>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canUpdate = can(MODULES.PROJECTS, 'update');
  const [state, setState] = useState({ project: null, loading: true, error: null });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await projectsService.get(id);
      setState({ project: data, loading: false, error: null });
    } catch (error) {
      setState({ project: null, loading: false, error });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading && !state.project) return <PageLoader label="Loading project" />;
  if (state.error) {
    const missing = state.error.status === 404 || state.error.status === 400;
    return (
      <Card>
        <ErrorState
          title={missing ? 'Project not found' : 'This project could not load'}
          error={missing ? { message: 'It may not exist, or you are not on its team.' } : state.error}
          onRetry={missing ? undefined : load}
        />
        <div className="flex justify-center pb-8">
          <Button variant="secondary" leftIcon={ArrowLeft} onClick={() => navigate('/projects')}>
            Back to projects
          </Button>
        </div>
      </Card>
    );
  }

  const { project } = state;
  const location = [project.location.address, project.location.city, project.location.state, project.location.pincode].filter(Boolean).join(', ');

  return (
    <>
      <PageHeader
        title={project.name}
        description={[project.code, project.client.name].filter(Boolean).join(' · ')}
        meta={<StatusBadge status={project.status} />}
        actions={
          canUpdate && (
            <Button variant="secondary" leftIcon={Pencil} onClick={() => navigate(`/projects/${project.id}/edit`)}>
              Edit project
            </Button>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Overview" icon={UserRound} />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Client">{project.client.name}</Detail>
                <Detail label="Client contact">{project.client.contactPerson}</Detail>
                <Detail label="Client phone">{project.client.phone}</Detail>
                <Detail label="Project manager">{project.projectManager?.fullName}</Detail>
                <Detail label="Contract value">{project.contractValue ? formatCurrency(project.contractValue) : null}</Detail>
                <Detail label="Last updated">{formatDate(project.updatedAt)}</Detail>
              </dl>
              {project.description && <p className="mt-5 border-t border-line pt-4 text-sm whitespace-pre-line text-ink">{project.description}</p>}
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Schedule" icon={CalendarRange} />
              <CardBody className="space-y-4">
                <dl className="grid grid-cols-3 gap-4">
                  <Detail label="Start">{formatDate(project.startDate)}</Detail>
                  <Detail label="Planned end">{formatDate(project.plannedEndDate)}</Detail>
                  <Detail label="Actual end">{formatDate(project.actualEndDate)}</Detail>
                </dl>
                <div>
                  <p className="mb-1.5 text-xs text-muted">Reported progress</p>
                  <ProgressBar value={project.progressPercent} />
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Site location" icon={MapPin} />
              <CardBody>
                <p className="text-sm text-ink">{location || '—'}</p>
              </CardBody>
            </Card>
          </div>
        </div>

        <TeamCard projectId={project.id} canManage={canUpdate} />
      </div>
    </>
  );
}
