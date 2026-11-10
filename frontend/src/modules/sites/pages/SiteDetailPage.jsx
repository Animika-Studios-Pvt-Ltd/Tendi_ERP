import { ArrowLeft, Calendar, Edit3, FileText, HardHat, MapPin, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { sitesService } from '@/services/sites.service';
import { formatDate } from '@/utils/format';

export default function SiteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canUpdate = can(MODULES.SITES, ACTIONS.UPDATE);
  const canDelete = can(MODULES.SITES, ACTIONS.DELETE);
  const canCreateDpr = can(MODULES.SITES, ACTIONS.CREATE);

  const [site, setSite] = useState(null);
  const [dprs, setDprs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [siteRes, dprRes] = await Promise.all([
        sitesService.getSite(id),
        sitesService.listDprs({ site: id, limit: 10 }),
      ]);
      setSite(siteRes.data);
      setDprs(dprRes.data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!canDelete || !site) return;
    if (!window.confirm(`Are you sure you want to delete site ${site.name} (${site.code})?`)) {
      return;
    }
    try {
      await sitesService.deleteSite(site.id);
      navigate('/sites');
    } catch (err) {
      alert(err.message || 'Failed to delete site');
    }
  };

  if (loading) return <PageLoader message="Loading site details…" />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!site) return null;

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button variant="outline" leftIcon={ArrowLeft} onClick={() => navigate('/sites')}>
        Back
      </Button>
      {canCreateDpr && (
        <Button
          leftIcon={Plus}
          onClick={() => navigate(`/sites/daily-progress/new?site=${site.id}&project=${site.project?.id}`)}
        >
          New DPR
        </Button>
      )}
      {canUpdate && (
        <Button variant="outline" leftIcon={Edit3} onClick={() => navigate(`/sites/${site.id}/edit`)}>
          Edit site
        </Button>
      )}
      {canDelete && (
        <Button variant="danger" leftIcon={Trash2} onClick={handleDelete}>
          Delete
        </Button>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title={site.name}
        description={`Code: ${site.code} · Project: ${site.project?.name || '—'}`}
        actions={headerActions}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Identity & Status */}
          <Card>
            <CardBody className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-accent-700 bg-accent-50 px-2 py-0.5 rounded border border-accent-200">
                      {site.code}
                    </span>
                    <StatusBadge status={site.status} />
                  </div>
                  <h2 className="mt-2 text-xl font-bold text-ink">{site.name}</h2>
                  <p className="mt-1 text-sm text-muted">{site.description || 'No description provided.'}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Daily Progress Reports for this site */}
          <Card>
            <CardHeader
              title="Daily Progress Reports"
              description="Recent field logs and progress submissions for this site"
              action={
                canCreateDpr && (
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={Plus}
                    onClick={() =>
                      navigate(`/sites/daily-progress/new?site=${site.id}&project=${site.project?.id}`)
                    }
                  >
                    Draft report
                  </Button>
                )
              }
            />
            <CardBody>
              {!dprs.length ? (
                <div className="text-center py-8">
                  <FileText className="mx-auto h-8 w-8 text-muted/60" />
                  <p className="mt-2 text-sm font-medium text-ink">No progress reports filed yet</p>
                  <p className="text-xs text-muted">Daily reports submitted by site engineers will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {dprs.map((dpr) => (
                    <div
                      key={dpr.id}
                      className="flex items-center justify-between py-3 hover:bg-navy-50/50 cursor-pointer px-2 rounded-md transition-colors"
                      onClick={() => navigate(`/sites/daily-progress/${dpr.id}`)}
                    >
                      <div className="min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-ink">
                            {dpr.reportNumber}
                          </span>
                          <StatusBadge status={dpr.status} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {formatDate(dpr.reportDate)} · Weather: {dpr.weather?.condition} · {dpr.workDone?.length || 0} activities
                        </p>
                      </div>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right Column: Location & Personnel */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Site Information" />
            <CardBody className="space-y-4 text-xs">
              <div>
                <p className="font-semibold text-muted">Site Engineer in-charge</p>
                {site.siteEngineer ? (
                  <div className="mt-1 flex items-center gap-2">
                    <Avatar name={site.siteEngineer.fullName} size="sm" />
                    <div>
                      <p className="font-medium text-ink">{site.siteEngineer.fullName}</p>
                      <p className="text-muted">{site.siteEngineer.email}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-muted">Unassigned</p>
                )}
              </div>

              <div className="border-t border-line pt-3">
                <p className="font-semibold text-muted">Location</p>
                <div className="mt-1 flex items-start gap-2 text-ink">
                  <MapPin className="h-4 w-4 text-muted shrink-0 mt-0.5" />
                  <div>
                    <p>{site.location?.address || 'No street address'}</p>
                    <p className="text-muted">
                      {[site.location?.city, site.location?.state, site.location?.pincode]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-line pt-3">
                <p className="font-semibold text-muted">Timeline</p>
                <div className="mt-1 flex items-center gap-2 text-ink">
                  <Calendar className="h-4 w-4 text-muted shrink-0" />
                  <span>
                    {site.startDate ? formatDate(site.startDate) : 'Not started'} –{' '}
                    {site.targetCompletionDate ? formatDate(site.targetCompletionDate) : 'Ongoing'}
                  </span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

