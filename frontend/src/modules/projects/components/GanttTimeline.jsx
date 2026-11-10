import { CalendarRange, Flag, GitBranch, Layers } from 'lucide-react';
import StatusBadge from '@/components/common/StatusBadge';
import Badge from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { formatDate } from '@/utils/format';

function flattenWbsTree(nodes = [], depth = 0) {
  const out = [];
  for (const node of nodes) {
    out.push({ ...node, depth });
    if (node.children?.length) {
      out.push(...flattenWbsTree(node.children, depth + 1));
    }
  }
  return out;
}

export default function GanttTimeline({ gantt, wbs }) {
  if (!gantt) return null;
  const tasks = gantt.tasks || [];
  const milestones = gantt.milestones || [];
  const orderedWbs = wbs?.tree?.length ? flattenWbsTree(wbs.tree) : tasks.map((t) => ({ ...t, depth: 0 }));

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const rows = orderedWbs.map((n) => ({ ...(taskById.get(n.id) || n), depth: n.depth ?? 0 }));

  // Compute global timeline range across project, baseline, tasks, and milestones
  const timestamps = [];
  const pushDate = (val) => {
    if (!val) return;
    const ms = new Date(val).getTime();
    if (Number.isFinite(ms)) timestamps.push(ms);
  };

  pushDate(gantt.project?.startDate);
  pushDate(gantt.project?.plannedEndDate);
  pushDate(gantt.project?.baseline?.startDate);
  pushDate(gantt.project?.baseline?.plannedEndDate);
  rows.forEach((t) => {
    pushDate(t.startDate);
    pushDate(t.dueDate);
    pushDate(t.baselineStartDate);
    pushDate(t.baselineDueDate);
  });
  milestones.forEach((m) => pushDate(m.targetDate));

  const minMs = timestamps.length ? Math.min(...timestamps) : Date.now();
  const maxMs = timestamps.length ? Math.max(...timestamps) : minMs + 30 * 86400000;
  const spanMs = Math.max(86400000, maxMs - minMs);

  const barStyle = (start, end) => {
    if (!start && !end) return null;
    const s = start ? new Date(start).getTime() : new Date(end).getTime();
    const e = end ? new Date(end).getTime() : s + 86400000;
    const left = Math.max(0, Math.min(98, ((s - minMs) / spanMs) * 100));
    const width = Math.max(2, Math.min(100 - left, ((Math.max(e, s + 86400000) - s) / spanMs) * 100));
    return { left: `${left}%`, width: `${width}%` };
  };

  const markerLeft = (dateVal) => {
    if (!dateVal) return null;
    const ms = new Date(dateVal).getTime();
    const pct = Math.max(0, Math.min(99, ((ms - minMs) / spanMs) * 100));
    return `${pct}%`;
  };

  return (
    <div className="space-y-6">
      {wbs?.workPackages?.length > 0 && (
        <Card>
          <CardHeader icon={Layers} title="Work Packages Summary" description="Rolled-up progress by WBS work package" />
          <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {wbs.workPackages.map((pkg) => (
              <div key={pkg.workPackage} className="rounded-md border border-line bg-canvas p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-ink">{pkg.workPackage}</p>
                  <span className="tabular text-xs font-bold text-navy-700">{pkg.progressPercent}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-navy-100">
                  <div className="h-full rounded-full bg-navy-800" style={{ width: `${pkg.progressPercent}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-muted">
                  {pkg.completedCount}/{pkg.taskCount} tasks completed · {pkg.estimatedHours}h planned
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          icon={CalendarRange}
          title="WBS & Gantt Schedule"
          description={
            timestamps.length
              ? `Timeline: ${formatDate(new Date(minMs))} – ${formatDate(new Date(maxMs))}${
                  gantt.project?.scheduleVarianceDays
                    ? ` · Schedule variance vs baseline: ${gantt.project.scheduleVarianceDays > 0 ? '+' : ''}${gantt.project.scheduleVarianceDays}d`
                    : ''
                }`
              : 'Add start and due dates to tasks to visualize the project schedule.'
          }
        />
        <CardBody className="p-0 overflow-x-auto">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              No WBS tasks created for this project yet. Add tasks in the Tasks tab to build the Gantt schedule.
            </div>
          ) : (
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead className="border-b border-line bg-navy-50/50 text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 w-72 font-semibold">WBS / Task</th>
                  <th className="px-3 py-2.5 w-28 font-semibold">Status</th>
                  <th className="px-3 py-2.5 w-36 font-semibold">Dates</th>
                  <th className="px-4 py-2.5 font-semibold">
                    <div className="flex items-center justify-between">
                      <span>Timeline (Blue = Current, Gray = Baseline)</span>
                      <span className="tabular text-[10px] font-normal">
                        {formatDate(new Date(minMs))} &rarr; {formatDate(new Date(maxMs))}
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((t) => {
                  const currentBar = barStyle(t.startDate, t.dueDate);
                  const baseBar = barStyle(t.baselineStartDate, t.baselineDueDate);
                  return (
                    <tr key={t.id} className="hover:bg-navy-50/30">
                      <td className="px-4 py-2.5">
                        <div style={{ paddingLeft: `${t.depth * 16}px` }} className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {t.wbsCode && (
                              <span className="font-mono text-[11px] font-semibold text-navy-600">{t.wbsCode}</span>
                            )}
                            <span className="truncate font-medium text-ink">{t.title}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                            <span className="font-mono">{t.code}</span>
                            {t.workPackage && <span>· {t.workPackage}</span>}
                            {t.dependencies?.length > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-navy-600">
                                <GitBranch size={11} />
                                {t.dependencies.map((d) => d.code || d).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={t.status} />
                          {t.isDelayed && <Badge tone="danger">Overdue</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 tabular text-[11px] text-muted whitespace-nowrap">
                        <div>{t.startDate ? formatDate(t.startDate) : '—'}</div>
                        <div>
                          {t.dueDate ? formatDate(t.dueDate) : '—'}
                          {t.varianceDays !== 0 && (
                            <span className={t.varianceDays > 0 ? 'ml-1 text-danger-600' : 'ml-1 text-success-600'}>
                              ({t.varianceDays > 0 ? `+${t.varianceDays}d` : `${t.varianceDays}d`})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="relative h-7 rounded bg-canvas border border-line/60">
                          {baseBar && (
                            <div
                              className="absolute bottom-1 h-1.5 rounded-full bg-slate-300"
                              style={baseBar}
                              title={`Baseline: ${formatDate(t.baselineStartDate)} – ${formatDate(t.baselineDueDate)}`}
                            />
                          )}
                          {currentBar ? (
                            <div
                              className={`absolute top-1.5 h-3.5 rounded ${
                                t.isDelayed
                                  ? 'bg-danger-200 border border-danger-400'
                                  : 'bg-navy-100 border border-navy-300'
                              }`}
                              style={currentBar}
                              title={`${t.title}: ${t.progressPercent}%`}
                            >
                              <div
                                className={`h-full rounded-l ${
                                  t.status === 'completed'
                                    ? 'bg-success-600'
                                    : t.isDelayed
                                      ? 'bg-danger-600'
                                      : 'bg-navy-700'
                                }`}
                                style={{ width: `${t.progressPercent}%` }}
                              />
                            </div>
                          ) : (
                            <span className="px-2 leading-7 text-[11px] text-subtle">Unscheduled</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {milestones.map((m) => {
                  const left = markerLeft(m.targetDate);
                  return (
                    <tr key={`ms-${m.id}`} className="bg-accent-50/20">
                      <td className="px-4 py-2 font-medium text-ink">
                        <span className="inline-flex items-center gap-1.5">
                          <Flag size={13} className="text-accent-600" />
                          {m.title}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="px-3 py-2 tabular text-[11px] text-muted">{formatDate(m.targetDate)}</td>
                      <td className="px-4 py-2">
                        <div className="relative h-5">
                          {left && (
                            <div
                              className="absolute top-1 h-3 w-3 -translate-x-1/2 rotate-45 bg-accent-500 border border-navy-900"
                              style={{ left }}
                              title={`Milestone: ${m.title} (${formatDate(m.targetDate)})`}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

