import { ArrowLeft, CalendarRange, Lock, MapPin, Pencil, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { projectsService } from '@/services/projects.service';
import { sitesService } from '@/services/sites.service';
import { formatCurrency, formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';
import GanttTimeline from '../components/GanttTimeline';
import ProgressBar from '../components/ProgressBar';
import { ChangeOrdersPanel, ReadinessClosurePanel, RisksPanel } from '../components/ProjectControlTabs';
import TeamCard from '../components/TeamCard';

const TABS = [
  { key: 'overview', label: 'Overview & Baseline' },
  { key: 'schedule', label: 'WBS & Gantt' },
  { key: 'sites', label: 'Sites & Milestones' },
  { key: 'risks', label: 'Risk Register' },
  { key: 'changes', label: 'Change Orders' },
  { key: 'closure', label: 'Readiness & Closure' },
];

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
  const canCreate = can(MODULES.PROJECTS, ACTIONS.CREATE);
  const canUpdate = can(MODULES.PROJECTS, ACTIONS.UPDATE);
  const canDelete = can(MODULES.PROJECTS, ACTIONS.DELETE);
  const canApprove = can(MODULES.PROJECTS, ACTIONS.APPROVE);
  const canReject = can(MODULES.PROJECTS, ACTIONS.REJECT);

  const [tab, setTab] = useState('overview');
  const [state, setState] = useState({ project: null, loading: true, error: null });
  const [extras, setExtras] = useState({
    wbs: null,
    gantt: null,
    sites: [],
    milestones: [],
    risks: [],
    changeOrders: [],
    readiness: null,
  });
  const [freezing, setFreezing] = useState(false);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await projectsService.get(id);
      setState({ project: data, loading: false, error: null });
    } catch (error) {
      setState({ project: null, loading: false, error });
    }
  }, [id]);

  const loadExtras = useCallback(async () => {
    try {
      const [wbsRes, ganttRes, sitesRes, msRes, risksRes, coRes, readyRes] = await Promise.all([
        projectsService.getWbs(id).catch(() => ({ data: null })),
        projectsService.getGantt(id).catch(() => ({ data: null })),
        sitesService.listSites({ project: id, limit: 50 }).catch(() => ({ data: [] })),
        projectsService.listMilestones({ project: id, limit: 50 }).catch(() => ({ data: [] })),
        projectsService.listRisks(id).catch(() => ({ data: [] })),
        projectsService.listChangeOrders(id).catch(() => ({ data: [] })),
        projectsService.getReadiness(id).catch(() => ({ data: null })),
      ]);
      setExtras({
        wbs: wbsRes.data,
        gantt: ganttRes.data,
        sites: sitesRes.data || [],
        milestones: msRes.data || [],
        risks: risksRes.data || [],
        changeOrders: coRes.data || [],
        readiness: readyRes.data,
      });
    } catch {
      // ignore partial extra failures
    }
  }, [id]);

  useEffect(() => {
    load();
    loadExtras();
  }, [load, loadExtras]);

  const refreshAll = useCallback(() => {
    load();
    loadExtras();
  }, [load, loadExtras]);

  const handleFreezeBaseline = async () => {
    const notes = window.prompt('Optional baseline freeze notes (e.g., Initial Contract Baseline v1):') ?? '';
    setFreezing(true);
    try {
      await projectsService.freezeBaseline(id, { notes });
      refreshAll();
    } catch (err) {
      alert(err.message || 'Could not freeze baseline');
    } finally {
      setFreezing(false);
    }
  };

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
          <div className="flex items-center gap-2">
            {canUpdate && !project.baseline?.lockedAt && (
              <Button variant="secondary" leftIcon={Lock} loading={freezing} onClick={handleFreezeBaseline}>
                Freeze baseline
              </Button>
            )}
            {canUpdate && (
              <Button variant="secondary" leftIcon={Pencil} onClick={() => navigate(`/projects/${project.id}/edit`)}>
                Edit project
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 text-xs font-semibold border-b-2 transition-colors',
              tab === t.key
                ? 'border-navy-900 text-navy-900'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
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
                <CardHeader title="Schedule & Planned vs Baseline" icon={CalendarRange} />
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
                  {project.baseline?.lockedAt ? (
                    <div className="rounded border border-line bg-canvas p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">Frozen Baseline</span>
                        <Badge tone="info">Locked {formatDate(project.baseline.lockedAt)}</Badge>
                      </div>
                      <p className="text-muted">
                        Baseline Value: <strong className="text-ink">{formatCurrency(project.baseline.contractValue)}</strong> · Baseline End:{' '}
                        <strong className="text-ink">{formatDate(project.baseline.plannedEndDate)}</strong>
                      </p>
                      {project.baseline.notes && <p className="text-muted">{project.baseline.notes}</p>}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">No baseline frozen yet. Freeze baseline to track schedule & budget variance.</p>
                  )}
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
      )}

      {tab === 'schedule' && <GanttTimeline gantt={extras.gantt} wbs={extras.wbs} />}

      {tab === 'sites' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Project Sites" description={`${extras.sites.length} registered site(s)`} />
            <CardBody className="p-0 divide-y divide-line">
              {extras.sites.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted">No sites registered under this project.</p>
              ) : (
                extras.sites.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-5 py-3 hover:bg-navy-50/40 cursor-pointer"
                    onClick={() => navigate(`/sites/${s.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">{s.name}</p>
                      <p className="font-mono text-xs text-muted">{s.code}</p>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Milestones" description={`${extras.milestones.length} milestone(s)`} />
            <CardBody className="p-0 divide-y divide-line">
              {extras.milestones.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted">No milestones defined yet.</p>
              ) : (
                extras.milestones.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{m.title}</p>
                      <p className="text-xs text-muted">Target: {formatDate(m.targetDate)}</p>
                    </div>
                    <div className="w-24"><ProgressBar value={m.progressPercent} /></div>
                    <StatusBadge status={m.status} />
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'risks' && (
        <RisksPanel
          projectId={project.id}
          risks={extras.risks}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onRefresh={refreshAll}
        />
      )}

      {tab === 'changes' && (
        <ChangeOrdersPanel
          projectId={project.id}
          changeOrders={extras.changeOrders}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canApprove={canApprove}
          canReject={canReject}
          onRefresh={refreshAll}
        />
      )}

      {tab === 'closure' && (
        <ReadinessClosurePanel
          project={project}
          readiness={extras.readiness}
          canUpdate={canUpdate}
          onRefresh={refreshAll}
        />
      )}
    </>
  );
}
