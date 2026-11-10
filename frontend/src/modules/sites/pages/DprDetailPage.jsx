import { ArrowLeft, CheckCircle2, CloudSun, Edit3, Send, ShieldAlert, Users, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import Textarea from '@/components/ui/Textarea';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { sitesService } from '@/services/sites.service';
import { formatDate } from '@/utils/format';

export default function DprDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, can } = useAuth();
  const canUpdate = can(MODULES.SITES, ACTIONS.UPDATE);
  const canApprove = can(MODULES.SITES, ACTIONS.APPROVE);
  const canReject = can(MODULES.SITES, ACTIONS.REJECT);

  const [dpr, setDpr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await sitesService.getDpr(id);
      setDpr(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTransition = async (targetStatus, comment) => {
    setActionLoading(true);
    try {
      await sitesService.transitionDpr(id, { status: targetStatus, comment });
      setShowRejectModal(false);
      setRejectComment('');
      load();
    } catch (err) {
      alert(err.message || 'Status transition failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <PageLoader message="Loading progress report…" />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!dpr) return null;

  const isDraft = dpr.status === 'draft';
  const isSubmitted = dpr.status === 'submitted';
  const isApproved = dpr.status === 'approved';
  const isRejected = dpr.status === 'rejected';
  const isReturned = dpr.status === 'returned';
  const canEditStatus = isDraft || isRejected || isReturned;

  const totalHeadcount = (dpr.labourAttendance || []).reduce(
    (acc, curr) => acc + (curr.headcount || 0),
    0,
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button variant="outline" leftIcon={ArrowLeft} onClick={() => navigate('/sites/daily-progress')}>
        Back
      </Button>
      {canEditStatus && canUpdate && (
        <Button leftIcon={Edit3} onClick={() => navigate(`/sites/daily-progress/${dpr.id}/edit`)}>
          Edit report
        </Button>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title={dpr.reportNumber}
        description={`Report Date: ${formatDate(dpr.reportDate)} · Site: ${dpr.site?.name || '—'}`}
        actions={headerActions}
      />

      {/* Approval Action Banner */}
      {isSubmitted && (canApprove || canReject) && (
        <div className="mb-6 rounded-lg border border-accent-300 bg-accent-50/50 p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-navy-900">
                Supervisor Review & Approval Required
              </p>
              <p className="text-xs text-muted">
                Submitted by <strong>{dpr.submittedBy?.fullName || dpr.createdBy?.fullName}</strong> on{' '}
                {dpr.submittedAt ? formatDate(dpr.submittedAt) : 'recently'}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canReject && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={XCircle}
                  onClick={() => setShowRejectModal(true)}
                  loading={actionLoading}
                >
                  Reject with reason
                </Button>
              )}
              {canApprove && (
                <Button
                  size="sm"
                  leftIcon={CheckCircle2}
                  onClick={() => handleTransition('approved')}
                  loading={actionLoading}
                >
                  Approve DPR
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {isDraft && canUpdate && (
        <div className="mb-6 rounded-lg border border-line bg-navy-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink">This report is currently in Draft status</p>
            <p className="text-xs text-muted">Once verified, submit for Project Manager approval.</p>
          </div>
          <Button
            size="sm"
            leftIcon={Send}
            onClick={() => handleTransition('submitted')}
            loading={actionLoading}
          >
            Submit for PM review
          </Button>
        </div>
      )}

      {isApproved && (
        <div className="mb-6 rounded-lg border border-success-200 bg-success-50/50 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-success-600 shrink-0" />
          <div className="text-xs">
            <span className="font-bold text-success-900">Report Approved</span>
            <span className="text-success-800 ml-1">
              by {dpr.decidedBy?.fullName} on {formatDate(dpr.decidedAt)}.
              {dpr.decisionComment ? ` (${dpr.decisionComment})` : ''}
            </span>
          </div>
        </div>
      )}

      {(isRejected || isReturned) && (
        <div className="mb-6 rounded-lg border border-danger-200 bg-danger-50/50 p-4 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-danger-600 shrink-0" />
          <div className="text-xs">
            <span className="font-bold text-danger-900">
              {isReturned ? 'Returned for Correction' : 'Report Rejected'}
            </span>
            <span className="text-danger-800 ml-1">
              by {dpr.decidedBy?.fullName}: {dpr.decisionComment || 'Needs revision'}.
            </span>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
          <Card className="w-full max-w-md shadow-overlay">
            <CardHeader title="Reject Daily Progress Report" />
            <CardBody className="space-y-4">
              <p className="text-xs text-muted">
                Please provide specific feedback or reason for returning this report to the site engineer:
              </p>
              <Textarea
                rows={3}
                placeholder="Reason for rejection (e.g. Quantity discrepancy in PCC casting)..."
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
              />
            </CardBody>
            <div className="flex justify-end gap-2 border-t border-line p-4">
              <Button variant="outline" size="sm" onClick={() => setShowRejectModal(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!rejectComment.trim()}
                loading={actionLoading}
                onClick={() => handleTransition('rejected', rejectComment.trim())}
              >
                Confirm Rejection
              </Button>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Work Executed Table */}
          <Card>
            <CardHeader
              title="Work Executed"
              description={`${dpr.workDone?.length || 0} activities recorded`}
            />
            <CardBody className="p-0">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-navy-50/50 uppercase text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Activity Description</th>
                    <th className="px-3 py-2.5 font-semibold">Location / Grid</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Quantity</th>
                    <th className="px-3 py-2.5 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {!dpr.workDone?.length ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-center text-muted">
                        No work items recorded
                      </td>
                    </tr>
                  ) : (
                    dpr.workDone.map((w, idx) => (
                      <tr key={idx} className="hover:bg-navy-50/30">
                        <td className="px-4 py-3 font-medium text-ink">{w.description}</td>
                        <td className="px-3 py-3 text-muted">{w.locationOrGrid || '—'}</td>
                        <td className="px-3 py-3 text-right tabular font-medium text-ink">
                          {w.quantity} {w.unit}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Badge tone={w.status === 'completed' ? 'success' : 'neutral'}>
                            {w.status?.replace('_', ' ')}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {/* Labour Attendance */}
          <Card>
            <CardHeader
              title="Labour Attendance"
              description={`Total deployed: ${totalHeadcount} workers`}
            />
            <CardBody className="p-0">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-navy-50/50 uppercase text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Trade / Skill</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Headcount</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Hours</th>
                    <th className="px-4 py-2.5 font-semibold">Contractor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {!dpr.labourAttendance?.length ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-center text-muted">
                        No labour attendance recorded
                      </td>
                    </tr>
                  ) : (
                    dpr.labourAttendance.map((l, idx) => (
                      <tr key={idx} className="hover:bg-navy-50/30">
                        <td className="px-4 py-3 font-medium text-ink">{l.trade}</td>
                        <td className="px-3 py-3 text-right tabular font-bold text-ink">
                          {l.headcount}
                        </td>
                        <td className="px-3 py-3 text-right tabular text-muted">{l.hoursWorked}h</td>
                        <td className="px-4 py-3 text-muted">{l.contractorName || 'Direct Labour'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {/* Material Usage */}
          {Boolean(dpr.materialUsage?.length) && (
            <Card>
              <CardHeader title="Materials Consumed" />
              <CardBody className="p-0">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line bg-navy-50/50 uppercase text-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Material</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Consumed</th>
                      <th className="px-4 py-2.5 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {dpr.materialUsage.map((m, idx) => (
                      <tr key={idx} className="hover:bg-navy-50/30">
                        <td className="px-4 py-3 font-medium text-ink">{m.materialName}</td>
                        <td className="px-3 py-3 text-right tabular font-semibold text-ink">
                          {m.quantity} {m.unit}
                        </td>
                        <td className="px-4 py-3 text-muted">{m.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}

          {/* Remarks */}
          {dpr.remarks && (
            <Card>
              <CardHeader title="General Remarks" />
              <CardBody className="text-xs text-ink leading-relaxed">
                {dpr.remarks}
              </CardBody>
            </Card>
          )}
        </div>

        {/* Right Column: Environmental & Approval Timeline */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Site & Weather Context" />
            <CardBody className="space-y-3 text-xs">
              <div>
                <p className="font-semibold text-muted">Project</p>
                <p className="font-medium text-ink">
                  {dpr.project ? `${dpr.project.code} · ${dpr.project.name}` : '—'}
                </p>
              </div>

              <div className="border-t border-line pt-2.5">
                <p className="font-semibold text-muted">Site / Zone</p>
                <p className="font-medium text-ink">
                  {dpr.site ? `${dpr.site.code} - ${dpr.site.name}` : '—'}
                </p>
              </div>

              <div className="border-t border-line pt-2.5">
                <p className="font-semibold text-muted">Weather Conditions</p>
                <div className="mt-1 flex items-center gap-2 text-ink">
                  <CloudSun className="h-4 w-4 text-muted" />
                  <span className="capitalize">{dpr.weather?.condition}</span>
                  {dpr.weather?.temperature ? <span>({dpr.weather.temperature}°C)</span> : null}
                </div>
                {dpr.weather?.weatherImpact !== 'none' && (
                  <p className="mt-1 text-[11px] text-warning-700">
                    Impact: {dpr.weather?.weatherImpact?.replace(/_/g, ' ')}
                  </p>
                )}
              </div>

              <div className="border-t border-line pt-2.5">
                <p className="font-semibold text-muted">Report Logged By</p>
                <div className="mt-1 flex items-center gap-2">
                  <Avatar name={dpr.createdBy?.fullName} size="sm" />
                  <div>
                    <p className="font-medium text-ink">{dpr.createdBy?.fullName || '—'}</p>
                    <p className="text-muted text-[11px]">{dpr.createdBy?.email}</p>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Workflow History */}
          <Card>
            <CardHeader title="Approval Trail" />
            <CardBody className="space-y-3">
              {!dpr.approvalHistory?.length ? (
                <p className="text-xs text-muted">No state changes recorded yet.</p>
              ) : (
                <div className="relative border-l border-line ml-2 space-y-4 pl-4 text-xs">
                  {dpr.approvalHistory.map((h, idx) => (
                    <div key={idx} className="relative">
                      <div className="absolute -left-[21px] top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent-600" />
                      <div className="flex items-center gap-2">
                        <span className="font-semibold uppercase tracking-wider text-[10px] text-ink">
                          {h.fromStatus} &rarr; {h.toStatus}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted">
                        by {h.by?.fullName || 'User'} on {formatDate(h.at)}
                      </p>
                      {h.comment && (
                        <p className="mt-1 rounded bg-navy-50/50 p-2 text-ink italic">
                          &ldquo;{h.comment}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

