import { CalendarCheck2, CheckCircle2, Plus, Save, Users, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useWorkingProjectFilter } from '@/hooks/useWorkingProjectFilter';
import { erpService } from '@/services/erp.service';
import { projectsService } from '@/services/projects.service';
import { formatCurrency, formatDate } from '@/utils/format';

export default function HrWorkspacePage({ initialTab = 'employees' }) {
  const { can } = useAuth();
  const canCreate = can(MODULES.HR, ACTIONS.CREATE);
  const canApprove = can(MODULES.HR, ACTIONS.APPROVE);
  const canReject = can(MODULES.HR, ACTIONS.REJECT);
  const [selectedProjectId] = useWorkingProjectFilter();

  const [tab, setTab] = useState(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [banner, setBanner] = useState(null);

  // Daily Attendance Sheet state
  const [attDate, setAttDate] = useState(new Date().toISOString().slice(0, 10));
  const [attProject, setAttProject] = useState('');
  const [attShift, setAttShift] = useState('Day Shift');
  const [attSheet, setAttSheet] = useState({});
  const [savingAtt, setSavingAtt] = useState(false);

  // Modals
  const [empModal, setEmpModal] = useState(false);
  const [empForm, setEmpForm] = useState({ fullName: '', phone: '', workerCategory: 'daily_wage_labour', designation: 'Mason', wageType: 'daily', baseRate: '800', overtimeRate: '100' });
  const [leaveModal, setLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ employee: '', project: '', leaveType: 'casual', fromDate: new Date().toISOString().slice(0, 10), toDate: new Date().toISOString().slice(0, 10), days: '1', reason: '' });
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ project: '', month: new Date().toISOString().slice(0, 7) });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = selectedProjectId ? { project: selectedProjectId } : {};
    try {
      const [e, a, l, p] = await Promise.all([
        erpService.hr.listEmployees(params),
        erpService.hr.listAttendance(params),
        erpService.hr.listLeaves(params),
        erpService.hr.listPayroll(params),
      ]);
      setEmployees(e.data || []);
      setAttendance(a.data || []);
      setLeaves(l.data || []);
      setPayroll(p.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    load();
    projectsService
      .list({ limit: 100 })
      .then(({ data }) => {
        const list = data || [];
        setProjects(list);
        if (!attProject && list.length > 0) {
          setAttProject(selectedProjectId || list[0].id);
        }
      })
      .catch(() => {});
  }, [load, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) setAttProject(selectedProjectId);
  }, [selectedProjectId]);

  // Seed/refresh attendance sheet rows from loaded employees & matching date/project records
  useEffect(() => {
    const activeProj = attProject || selectedProjectId;
    const next = {};
    for (const emp of employees) {
      const existing = attendance.find(
        (a) =>
          String(a.employee?._id || a.employee) === String(emp.id) &&
          (!activeProj || String(a.project?._id || a.project) === String(activeProj)) &&
          a.date &&
          String(a.date).slice(0, 10) === attDate,
      );
      next[emp.id] = {
        status: existing?.status || 'present',
        regularHours: String(existing?.regularHours ?? 8),
        overtimeHours: String(existing?.overtimeHours ?? 0),
        notes: existing?.notes || '',
      };
    }
    setAttSheet(next);
  }, [employees, attendance, attDate, attProject, selectedProjectId]);

  const handleSaveBulkAttendance = async (e) => {
    e.preventDefault();
    const targetProject = attProject || selectedProjectId || projects[0]?.id;
    if (!targetProject) {
      setBanner({ type: 'error', text: 'Select a project before marking attendance.' });
      return;
    }
    if (employees.length === 0) return;

    setSavingAtt(true);
    setBanner(null);
    try {
      const records = employees.map((emp) => {
        const row = attSheet[emp.id] || { status: 'present', regularHours: '8', overtimeHours: '0', notes: '' };
        return {
          employee: emp.id,
          status: row.status,
          regularHours: Number(row.regularHours || 0),
          overtimeHours: Number(row.overtimeHours || 0),
          notes: row.notes || '',
        };
      });
      await erpService.hr.bulkAttendance({
        project: targetProject,
        date: attDate,
        shiftName: attShift,
        records,
      });
      setBanner({ type: 'success', text: `Saved attendance for ${records.length} employee(s) on ${attDate}.` });
      await load();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setSavingAtt(false);
    }
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="HR, Labour & Payroll"
        description="Manage company employees, daily-wage labour, contractor labour, site attendance, leaves, and payroll runs."
        actions={
          canCreate && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" leftIcon={CalendarCheck2} onClick={() => setTab('attendance')}>Mark Attendance</Button>
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setLeaveModal(true)}>Request Leave</Button>
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setPayModal(true)}>Generate Payroll</Button>
              <Button size="sm" leftIcon={Plus} onClick={() => setEmpModal(true)}>Add Worker</Button>
            </div>
          )
        }
      />

      {banner && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-xs ${
            banner.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-line pb-1">
        {[
          { key: 'employees', label: `Personnel & Labour (${employees.length})` },
          { key: 'attendance', label: 'Attendance Register' },
          { key: 'leave', label: `Leave Requests (${leaves.length})` },
          { key: 'payroll', label: `Payroll Runs (${payroll.length})` },
        ].map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t.key ? 'bg-navy-900 text-white' : 'text-muted hover:bg-canvas'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'employees' && (
        employees.length === 0 ? (
          <Card>
            <CardBody className="py-10 text-center text-xs text-muted">
              No employees or site workers added yet. Click <strong>Add Worker</strong> to register personnel.
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {employees.map((e) => (
              <Card key={e.id}>
                <CardBody className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold">{e.empCode}</span>
                    <Badge tone="info">{e.workerCategory.replaceAll('_', ' ')}</Badge>
                  </div>
                  <p className="text-sm font-medium text-ink">{e.fullName}</p>
                  <p className="text-muted">{e.designation} · {formatCurrency(e.baseRate)}/{e.wageType}</p>
                  {e.phone && <p className="text-muted">{e.phone}</p>}
                </CardBody>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'attendance' && (
        <div className="space-y-4">
          {canCreate && (
            <Card>
              <form onSubmit={handleSaveBulkAttendance}>
                <CardHeader
                  title="Mark Daily Site Attendance"
                  description="Mark Present, Half Day, Absent or Leave for active workers — feeds Payroll Runs automatically."
                  icon={CalendarCheck2}
                />
                <CardBody className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-xs font-medium text-ink">Project *</label>
                      <Select
                        required
                        value={attProject || selectedProjectId}
                        onChange={(e) => setAttProject(e.target.value)}
                        placeholder="Select Project *"
                        options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-ink">Date *</label>
                      <Input required type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-ink">Shift</label>
                      <Select
                        value={attShift}
                        onChange={(e) => setAttShift(e.target.value)}
                        options={[
                          { value: 'Day Shift', label: 'Day Shift' },
                          { value: 'Night Shift', label: 'Night Shift' },
                        ]}
                      />
                    </div>
                  </div>

                  {employees.length === 0 ? (
                    <p className="rounded border border-line bg-canvas p-4 text-center text-xs text-muted">
                      No workers available in Personnel & Labour yet. Add workers first to mark daily attendance.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-line">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-line bg-canvas text-muted">
                          <tr>
                            <th className="px-3 py-2">Emp Code</th>
                            <th className="px-3 py-2">Name & Designation</th>
                            <th className="px-3 py-2">Category</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2 w-24">Reg Hrs</th>
                            <th className="px-3 py-2 w-24">OT Hrs</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {employees.map((emp) => {
                            const row = attSheet[emp.id] || { status: 'present', regularHours: '8', overtimeHours: '0' };
                            const updateRow = (patch) =>
                              setAttSheet((prev) => ({ ...prev, [emp.id]: { ...row, ...patch } }));
                            return (
                              <tr key={emp.id}>
                                <td className="px-3 py-2 font-mono font-semibold">{emp.empCode}</td>
                                <td className="px-3 py-2">
                                  <p className="font-medium text-ink">{emp.fullName}</p>
                                  <p className="text-[11px] text-muted">{emp.designation}</p>
                                </td>
                                <td className="px-3 py-2 text-muted">{emp.workerCategory.replaceAll('_', ' ')}</td>
                                <td className="px-3 py-2">
                                  <Select
                                    size="sm"
                                    value={row.status}
                                    onChange={(e) => updateRow({ status: e.target.value })}
                                    options={[
                                      { value: 'present', label: 'Present' },
                                      { value: 'half_day', label: 'Half day' },
                                      { value: 'absent', label: 'Absent' },
                                      { value: 'leave', label: 'On leave' },
                                    ]}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    size="sm"
                                    type="number"
                                    min="0"
                                    max="24"
                                    value={row.regularHours}
                                    onChange={(e) => updateRow({ regularHours: e.target.value })}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    size="sm"
                                    type="number"
                                    min="0"
                                    max="12"
                                    value={row.overtimeHours}
                                    onChange={(e) => updateRow({ overtimeHours: e.target.value })}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardBody>
                {employees.length > 0 && (
                  <CardFooter className="flex justify-end">
                    <Button type="submit" size="sm" leftIcon={Save} loading={savingAtt}>
                      Save Attendance
                    </Button>
                  </CardFooter>
                )}
              </form>
            </Card>
          )}

          <Card>
            <CardHeader title="Attendance Log History" description={`${attendance.length} recorded entries`} />
            <CardBody className="space-y-2">
              {attendance.length === 0 ? (
                <p className="text-xs text-muted">No attendance records saved yet.</p>
              ) : (
                attendance.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded border border-line px-3 py-2 text-xs">
                    <span>{formatDate(a.date)} · <strong>{a.employee?.empCode}</strong> · {a.employee?.fullName} ({a.project?.code})</span>
                    <Badge tone={a.status === 'absent' ? 'danger' : a.status === 'half_day' ? 'warning' : 'success'}>
                      {a.status} · {a.regularHours}h (+{a.overtimeHours}h OT)
                    </Badge>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'leave' && (
        leaves.length === 0 ? (
          <Card><CardBody className="py-10 text-center text-xs text-muted">No leave requests submitted yet.</CardBody></Card>
        ) : (
          <div className="space-y-2">
            {leaves.map((l) => (
              <Card key={l.id}>
                <CardBody className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                  <div>
                    <p className="font-semibold text-ink">{l.employee?.fullName} · {l.leaveType} ({l.days}d)</p>
                    <p className="text-muted">{formatDate(l.fromDate)} → {formatDate(l.toDate)} · {l.reason}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={l.status} />
                    {l.status === 'submitted' && canApprove && (
                      <Button size="sm" leftIcon={CheckCircle2} onClick={async () => { await erpService.hr.transitionLeave(l.id, { status: 'approved' }); load(); }}>Approve</Button>
                    )}
                    {l.status === 'submitted' && canReject && (
                      <Button size="sm" variant="secondary" leftIcon={XCircle} onClick={async () => { await erpService.hr.transitionLeave(l.id, { status: 'rejected' }); load(); }}>Reject</Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'payroll' && (
        payroll.length === 0 ? (
          <Card><CardBody className="py-10 text-center text-xs text-muted">No payroll runs generated yet. Mark attendance first, then click Generate Payroll.</CardBody></Card>
        ) : (
          <div className="space-y-2">
            {payroll.map((p) => (
              <Card key={p.id}>
                <CardBody className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                  <div>
                    <p className="font-semibold text-ink">{p.runNumber} · {p.month} ({p.project?.code})</p>
                    <p className="text-muted">{p.entries?.length || 0} workers · Net Total: <strong>{formatCurrency(p.totalNet)}</strong></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={p.status} />
                    {p.status === 'draft' && canCreate && (
                      <Button size="sm" variant="secondary" onClick={async () => { await erpService.hr.transitionPayrollRun(p.id, { status: 'submitted' }); load(); }}>Submit</Button>
                    )}
                    {p.status === 'submitted' && canApprove && (
                      <Button size="sm" leftIcon={CheckCircle2} onClick={async () => { await erpService.hr.transitionPayrollRun(p.id, { status: 'approved' }); load(); }}>Approve</Button>
                    )}
                    {p.status === 'submitted' && canReject && (
                      <Button size="sm" variant="secondary" leftIcon={XCircle} onClick={async () => { await erpService.hr.transitionPayrollRun(p.id, { status: 'rejected' }); load(); }}>Reject</Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )
      )}

      {empModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={async (e) => {
              e.preventDefault();
              await erpService.hr.createEmployee({ ...empForm, baseRate: Number(empForm.baseRate), overtimeRate: Number(empForm.overtimeRate || 0), assignedProjects: selectedProjectId ? [selectedProjectId] : [] });
              setEmpModal(false);
              load();
            }}>
              <CardHeader title="Add Personnel / Worker" icon={Users} />
              <CardBody className="space-y-3">
                <Input required placeholder="Full Name *" value={empForm.fullName} onChange={(e) => setEmpForm({ ...empForm, fullName: e.target.value })} />
                <Input placeholder="Phone" value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} />
                <Select value={empForm.workerCategory} onChange={(e) => setEmpForm({ ...empForm, workerCategory: e.target.value })} options={[
                  { value: 'company_employee', label: 'Company Employee' },
                  { value: 'daily_wage_labour', label: 'Daily Wage Labour' },
                  { value: 'contractor_labour', label: 'Contractor Labour' },
                  { value: 'outsourced', label: 'Outsourced' },
                ]} />
                <Input placeholder="Designation / Trade" value={empForm.designation} onChange={(e) => setEmpForm({ ...empForm, designation: e.target.value })} />
                <div className="grid grid-cols-3 gap-2">
                  <Select value={empForm.wageType} onChange={(e) => setEmpForm({ ...empForm, wageType: e.target.value })} options={['daily', 'monthly', 'hourly'].map((w) => ({ value: w, label: w }))} />
                  <Input required type="number" placeholder="Base Rate ₹ *" value={empForm.baseRate} onChange={(e) => setEmpForm({ ...empForm, baseRate: e.target.value })} />
                  <Input type="number" placeholder="OT ₹/hr" value={empForm.overtimeRate} onChange={(e) => setEmpForm({ ...empForm, overtimeRate: e.target.value })} />
                </div>
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEmpModal(false)}>Cancel</Button>
                <Button type="submit">Save Worker</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {leaveModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={async (e) => {
              e.preventDefault();
              await erpService.hr.createLeave({ ...leaveForm, project: leaveForm.project || selectedProjectId || null, days: Number(leaveForm.days) });
              setLeaveModal(false);
              setTab('leave');
              load();
            }}>
              <CardHeader title="Submit Leave Request" />
              <CardBody className="space-y-3">
                <Select required value={leaveForm.employee} onChange={(e) => setLeaveForm({ ...leaveForm, employee: e.target.value })} placeholder="Select Employee *" options={employees.map((e) => ({ value: e.id, label: `${e.empCode} · ${e.fullName}` }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })} options={['casual', 'sick', 'earned', 'unpaid'].map((t) => ({ value: t, label: t }))} />
                  <Input required type="number" step="0.5" placeholder="Days *" value={leaveForm.days} onChange={(e) => setLeaveForm({ ...leaveForm, days: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input required type="date" value={leaveForm.fromDate} onChange={(e) => setLeaveForm({ ...leaveForm, fromDate: e.target.value })} />
                  <Input required type="date" value={leaveForm.toDate} onChange={(e) => setLeaveForm({ ...leaveForm, toDate: e.target.value })} />
                </div>
                <Textarea required rows={2} placeholder="Reason *" value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setLeaveModal(false)}>Cancel</Button>
                <Button type="submit">Submit Request</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {payModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={async (e) => {
              e.preventDefault();
              await erpService.hr.createPayrollRun({ project: payForm.project || selectedProjectId || projects[0]?.id, month: payForm.month });
              setPayModal(false);
              setTab('payroll');
              load();
            }}>
              <CardHeader title="Generate Monthly Payroll Run" />
              <CardBody className="space-y-3">
                <Select required value={payForm.project || selectedProjectId || projects[0]?.id || ''} onChange={(e) => setPayForm({ ...payForm, project: e.target.value })} placeholder="Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Input required type="month" value={payForm.month} onChange={(e) => setPayForm({ ...payForm, month: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setPayModal(false)}>Cancel</Button>
                <Button type="submit">Generate Payroll</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
