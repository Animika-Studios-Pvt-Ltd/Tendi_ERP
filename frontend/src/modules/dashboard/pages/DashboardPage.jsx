import {
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  HardHat,
  IndianRupee,
  Landmark,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useAuth } from '@/hooks/useAuth';
import { useWorkingProjectFilter } from '@/hooks/useWorkingProjectFilter';
import { erpService } from '@/services/erp.service';
import { notificationsService } from '@/services/notifications.service';
import { formatCurrencyCompact, formatDate, formatNumber } from '@/utils/format';
import KpiCard from '../components/KpiCard';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [selectedProjectId] = useWorkingProjectFilter();
  const [state, setState] = useState({ summary: null, approvals: [], loading: true, error: null });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [sumRes, appRes] = await Promise.all([
        erpService.dashboard.getSummary(selectedProjectId ? { project: selectedProjectId } : {}),
        notificationsService.pendingApprovals().catch(() => ({ data: [] })),
      ]);
      setState({ summary: sumRes.data, approvals: appRes.data || [], loading: false, error: null });
    } catch (error) {
      setState({ summary: null, approvals: [], loading: false, error });
    }
  }, [selectedProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) return <PageLoader />;
  if (state.error) return <ErrorState error={state.error} onRetry={load} />;
  const s = state.summary;
  if (!s) return null;

  const p = s.portfolio || {};
  const fin = s.finance;
  const wf = s.workforce;
  const inv = s.inventory;
  const proc = s.procurement;
  const qs = s.qualitySafety;
  const eq = s.equipment;
  const leg = s.legal;

  const budgetUsedPct =
    fin && fin.revisedBudget > 0 ? Math.min(100, Math.round((fin.actualSpend / fin.revisedBudget) * 100)) : 0;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.firstName}`}
        description={`Live portfolio overview · ${p.activeProjects ?? 0} active, ${p.completedProjects ?? 0} completed, ${p.delayedTasks ?? 0} delayed task(s).`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Landmark} label="Portfolio Contract Value" value={formatCurrencyCompact(p.totalContractValue || 0)}>
          {p.totalProjects || 0} project(s) · Avg completion {p.avgProgress || 0}%
        </KpiCard>

        {fin ? (
          <KpiCard icon={IndianRupee} label="Actual Spend vs Budget" value={formatCurrencyCompact(fin.actualSpend || 0)}>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-navy-50">
                <div className="h-full rounded-full bg-navy-900" style={{ width: `${budgetUsedPct}%` }} />
              </div>
              <span className="tabular font-medium text-ink">{budgetUsedPct}%</span>
            </div>
            <p className="mt-1">of {formatCurrencyCompact(fin.revisedBudget || 0)} budget</p>
          </KpiCard>
        ) : (
          <KpiCard icon={Boxes} label="Inventory Stock Value" value={formatCurrencyCompact(inv?.stockValuation || 0)}>
            {inv?.lowStockCount ?? 0} item(s) at or below reorder level
          </KpiCard>
        )}

        <KpiCard icon={ClipboardCheck} label="Pending Approvals" value={formatNumber(state.approvals.length)}>
          Across your authorized workflow queues
        </KpiCard>

        {wf ? (
          <KpiCard icon={HardHat} label="Workforce Attendance Today" value={formatNumber(wf.todayAttendance || 0)}>
            Out of {formatNumber(wf.activeWorkers || 0)} active personnel · {wf.activeWorkOrders || 0} active WOs
          </KpiCard>
        ) : (
          <KpiCard icon={AlertTriangle} label="Schedule Alerts" value={formatNumber((p.delayedTasks || 0) + (p.delayedMilestones || 0))}>
            {p.delayedTasks || 0} overdue tasks · {p.delayedMilestones || 0} overdue milestones
          </KpiCard>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Project Health & Progress" />
          <CardBody className="space-y-3">
            {(!s.projectHealth || s.projectHealth.length === 0) ? (
              <p className="text-xs text-muted">No projects assigned in current scope.</p>
            ) : (
              s.projectHealth.map((proj) => (
                <Link
                  key={proj.id}
                  to={`/projects/${proj.id}`}
                  className="block rounded-lg border border-line p-3 transition-colors hover:bg-canvas"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {proj.code} · {proj.name}
                      </p>
                      <p className="text-xs text-muted">Contract: {formatCurrencyCompact(proj.contractValue)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={proj.health} />
                      <span className="w-10 text-right text-xs font-semibold tabular-nums">{proj.progressPercent}%</span>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-navy-50">
                    <div className="h-full rounded-full bg-navy-900" style={{ width: `${proj.progressPercent}%` }} />
                  </div>
                </Link>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Actionable Approvals Queue" />
          <CardBody className="space-y-2">
            {state.approvals.length === 0 ? (
              <p className="text-xs text-muted">All pending approvals cleared.</p>
            ) : (
              state.approvals.slice(0, 7).map((item) => (
                <Link
                  key={`${item.type}-${item.id}`}
                  to={item.link || '/dashboard'}
                  className="block rounded-md border border-line px-3 py-2 text-xs transition-colors hover:bg-canvas"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{item.title}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-0.5 text-muted">
                    {item.type} · {item.project || 'Company'} {item.amount != null ? `· ${formatCurrencyCompact(item.amount)}` : ''}
                  </p>
                </Link>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Recent Site Progress (DPRs)" />
          <CardBody className="space-y-2 text-xs">
            {(!s.recentDprs || s.recentDprs.length === 0) ? (
              <p className="text-muted">No site reports logged yet.</p>
            ) : (
              s.recentDprs.map((d) => (
                <Link key={d.id} to={`/sites/daily-progress/${d.id}`} className="flex items-center justify-between rounded border border-line px-2.5 py-1.5 hover:bg-canvas">
                  <div>
                    <p className="font-medium text-ink">{d.reportNumber}</p>
                    <p className="text-muted">{d.project} · {d.site} · {formatDate(d.reportDate)}</p>
                  </div>
                  <StatusBadge status={d.status} />
                </Link>
              ))
            )}
          </CardBody>
        </Card>

        {inv && (
          <Card>
            <CardHeader title="Low Stock Watchlist" />
            <CardBody className="space-y-2 text-xs">
              {(!inv.lowStockItems || inv.lowStockItems.length === 0) ? (
                <p className="text-muted">All tracked materials are above reorder levels.</p>
              ) : (
                inv.lowStockItems.map((m, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded border border-line px-2.5 py-1.5">
                    <div>
                      <p className="font-medium text-ink">{m.materialName}</p>
                      <p className="text-muted">{m.materialCode} · Min {m.reorderLevel} {m.unit}</p>
                    </div>
                    <span className="font-semibold text-red-700">{m.currentStock} {m.unit}</span>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Governance, Procurement & Assets" />
          <CardBody className="space-y-2 text-xs">
            {proc && (
              <div className="flex justify-between rounded border border-line px-3 py-2">
                <span className="text-muted">Pending MRs / POs</span>
                <span className="font-semibold text-ink">{proc.pendingMrs} MR · {proc.pendingPos} PO</span>
              </div>
            )}
            {qs && (
              <div className="flex items-center justify-between rounded border border-line px-3 py-2">
                <span className="flex items-center gap-1.5 text-muted"><ShieldAlert className="h-3.5 w-3.5 text-amber-600" /> Open NCRs / Safety</span>
                <span className="font-semibold text-ink">{qs.openNcrs} NCR · {qs.openIncidents} Open</span>
              </div>
            )}
            {eq && (
              <div className="flex items-center justify-between rounded border border-line px-3 py-2">
                <span className="flex items-center gap-1.5 text-muted"><Wrench className="h-3.5 w-3.5 text-navy-600" /> Equipment Status</span>
                <span className="font-semibold text-ink">{eq.deployed} Deployed · {eq.inMaintenance} Maint.</span>
              </div>
            )}
            {leg && (
              <div className="flex justify-between rounded border border-line px-3 py-2">
                <span className="text-muted">Expiring Permits (30d)</span>
                <span className="font-semibold text-amber-700">{leg.expiringPermits}</span>
              </div>
            )}
            {fin && (
              <div className="flex justify-between rounded border border-line px-3 py-2">
                <span className="text-muted">Net Cash Flow</span>
                <span className="font-semibold text-ink">{formatCurrencyCompact(fin.netCashFlow)}</span>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
