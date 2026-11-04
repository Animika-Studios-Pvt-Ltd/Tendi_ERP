import { ClipboardCheck, HardHat, IndianRupee, Landmark } from 'lucide-react';
import DemoDataNotice from '@/components/common/DemoDataNotice';
import PageHeader from '@/components/common/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrencyCompact, formatDate, formatNumber } from '@/utils/format';
import ApprovalQueue from '../components/ApprovalQueue';
import AttendanceChart from '../components/AttendanceChart';
import CostTrendChart from '../components/CostTrendChart';
import KpiCard from '../components/KpiCard';
import LowStockTable from '../components/LowStockTable';
import SafetySummary from '../components/SafetySummary';
import ScheduleHealth from '../components/ScheduleHealth';
import {
  demoApprovals,
  demoAsOf,
  demoAttendance,
  demoCostTrend,
  demoKpis,
  demoLowStock,
  demoProjects,
  demoSafety,
  IS_DEMO_DATA,
} from '../data/dashboard.demo';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { contractValue, costToDate, budgetUsedPercent, pendingApprovals, labourToday } = demoKpis;
  const attention = demoProjects.filter((p) => p.status !== 'on_track').length;
  const attendancePercent = Math.round((labourToday.present / labourToday.planned) * 100);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.firstName}`}
        description={`Portfolio position as of ${formatDate(demoAsOf)}. ${demoProjects.length} active projects, ${attention} need attention.`}
      />

      {IS_DEMO_DATA && <DemoDataNotice />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Landmark} label="Contract value in execution" value={formatCurrencyCompact(contractValue)}>
          Across {demoProjects.length} active projects
        </KpiCard>
        <KpiCard icon={IndianRupee} label="Cost to date" value={formatCurrencyCompact(costToDate)}>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-navy-50">
              <div className="h-full rounded-full bg-navy-900" style={{ width: `${budgetUsedPercent}%` }} />
            </div>
            <span className="tabular font-medium text-ink">{budgetUsedPercent}%</span>
          </div>
          <p className="mt-1">of approved budget consumed</p>
        </KpiCard>
        <KpiCard icon={ClipboardCheck} label="Pending approvals" value={formatNumber(pendingApprovals.total)}>
          {pendingApprovals.materialRequests} material requests, {pendingApprovals.expenses} expenses, {pendingApprovals.contractorBills} bills,{' '}
          {pendingApprovals.progressReports} progress reports
        </KpiCard>
        <KpiCard icon={HardHat} label="Labour on site today" value={formatNumber(labourToday.present)}>
          {attendancePercent}% of {formatNumber(labourToday.planned)} planned
        </KpiCard>
      </div>

      <div className="mt-6">
        <ScheduleHealth projects={demoProjects} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <CostTrendChart data={demoCostTrend} />
        </div>
        <ApprovalQueue items={demoApprovals} total={pendingApprovals.total} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <LowStockTable rows={demoLowStock} />
        <AttendanceChart data={demoAttendance} />
        <SafetySummary safety={demoSafety} />
      </div>
    </>
  );
}
