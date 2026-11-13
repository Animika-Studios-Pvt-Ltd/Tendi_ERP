import { Router } from 'express';
import { z } from 'zod';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { AttendanceRecord, Employee, LeaveRequest, PayrollRun, WORKER_CATEGORIES } from '../../models/Hr.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { executeApprovalTransition } from '../../services/approval.service.js';
import { recordAudit } from '../../services/audit.service.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';

const { CREATE, READ, UPDATE, APPROVE, REJECT } = ACTIONS;
const can = (action) => authorize(MODULES.HR, action);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');
const nullableId = z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null);
const text = (max) => z.string().trim().max(max);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(2).max(140),
  phone: text(20).optional().default(''),
  email: text(120).optional().default(''),
  workerCategory: z.enum(Object.values(WORKER_CATEGORIES)).optional().default(WORKER_CATEGORIES.COMPANY_EMPLOYEE),
  contractorRef: nullableId.optional(),
  department: text(80).optional().default('Site Operations'),
  designation: text(80).optional().default('Worker'),
  trade: text(60).optional().default(''),
  wageType: z.enum(['monthly', 'daily', 'hourly']).optional().default('daily'),
  baseRate: z.coerce.number().min(0),
  overtimeRate: z.coerce.number().min(0).optional().default(100),
  assignedProjects: z.array(objectId).optional().default([]),
});

const bulkAttendanceSchema = z.object({
  project: objectId,
  site: nullableId.optional(),
  date: z.string().min(1),
  shiftName: text(60).optional().default('Day Shift'),
  records: z
    .array(
      z.object({
        employee: objectId,
        status: z.enum(['present', 'absent', 'half_day', 'leave']).default('present'),
        regularHours: z.coerce.number().min(0).max(24).optional().default(8),
        overtimeHours: z.coerce.number().min(0).max(12).optional().default(0),
        notes: text(300).optional().default(''),
      }),
    )
    .min(1),
});

const createLeaveSchema = z.object({
  employee: objectId,
  project: nullableId.optional(),
  leaveType: z.enum(['casual', 'sick', 'earned', 'unpaid']).optional().default('casual'),
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
  days: z.coerce.number().min(0.5),
  reason: z.string().trim().min(2).max(500),
});

const createPayrollSchema = z.object({
  project: objectId,
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM month format'),
  notes: text(500).optional().default(''),
});

const transitionSchema = z.object({
  status: z.enum(Object.values(APPROVAL_STATUS)),
  comment: text(500).optional().default(''),
});

const router = Router();
router.use(authenticate);

/* Employees & Worker Register */
router.get('/employees', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'assignedProjects' });
  const baseScope = req.user.role?.dataScope === 'all' ? {} : { $or: [scope, { assignedProjects: { $size: 0 } }] };
  const clauses = [baseScope];
  if (req.query.workerCategory) clauses.push({ workerCategory: req.query.workerCategory });
  if (req.query.project) {
    clauses.push({ $or: [{ assignedProjects: req.query.project }, { assignedProjects: { $size: 0 } }] });
  }
  const filter = clauses.length > 1 ? { $and: clauses } : baseScope;
  const rows = await Employee.find(filter)
    .populate('contractorRef', 'code companyName')
    .populate('assignedProjects', 'code name')
    .sort({ fullName: 1 })
    .lean();
  sendSuccess(res, rows.map((e) => ({ id: String(e._id), ...e })));
});

router.post('/employees', can(CREATE), validate({ body: createEmployeeSchema }), async (req, res) => {
  const empCode = await nextSequenceNumber('employee', { prefixOverride: 'EMP', minPadding: 4 });
  const emp = await Employee.create({ ...req.body, empCode, createdBy: req.user._id });
  sendSuccess(res, { id: String(emp._id), ...emp.toObject() }, { status: 201, message: `Employee ${empCode} added` });
});

/* Bulk Attendance & Deployment */
router.get('/attendance', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const filter = { ...scope };
  if (req.query.project) filter.project = req.query.project;
  if (req.query.date) {
    const d = new Date(`${req.query.date}T00:00:00.000Z`);
    const next = new Date(d.getTime() + 86400000);
    filter.date = { $gte: d, $lt: next };
  }
  const rows = await AttendanceRecord.find(filter)
    .populate('employee', 'empCode fullName workerCategory trade')
    .populate('project', 'code name')
    .sort({ date: -1 })
    .limit(200)
    .lean();
  sendSuccess(res, rows.map((a) => ({ id: String(a._id), ...a })));
});

router.post('/attendance/bulk', can(CREATE), validate({ body: bulkAttendanceSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const dateObj = new Date(`${req.body.date.slice(0, 10)}T00:00:00.000Z`);

  const ops = req.body.records.map((r) => ({
    updateOne: {
      filter: { employee: r.employee, project: req.body.project, date: dateObj },
      update: {
        $set: {
          site: req.body.site || null,
          shiftName: req.body.shiftName,
          status: r.status,
          regularHours: r.status === 'absent' ? 0 : r.status === 'half_day' ? 4 : r.regularHours,
          overtimeHours: r.status === 'absent' ? 0 : r.overtimeHours,
          notes: r.notes,
          recordedBy: req.user._id,
        },
      },
      upsert: true,
    },
  }));
  await AttendanceRecord.bulkWrite(ops);
  sendSuccess(res, { count: ops.length, date: dateObj }, { status: 201, message: `Saved ${ops.length} attendance records` });
});

/* Leaves */
router.get('/leaves', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const filter = req.user.role?.dataScope === 'all' ? {} : { $or: [scope, { project: null }] };
  const rows = await LeaveRequest.find(filter)
    .populate('employee', 'empCode fullName workerCategory')
    .populate('project', 'code name')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, rows.map((l) => ({ id: String(l._id), ...l })));
});

router.post('/leaves', can(CREATE), validate({ body: createLeaveSchema }), async (req, res) => {
  if (req.body.project && !canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const leave = await LeaveRequest.create({
    ...req.body,
    fromDate: new Date(req.body.fromDate),
    toDate: new Date(req.body.toDate),
    status: APPROVAL_STATUS.SUBMITTED,
    submittedBy: req.user._id,
    submittedAt: new Date(),
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  sendSuccess(res, { id: String(leave._id), ...leave.toObject() }, { status: 201, message: 'Leave request submitted' });
});

router.post(
  '/leaves/:id/transition',
  authorize(MODULES.HR, CREATE, UPDATE, APPROVE, REJECT),
  validate({ params: z.object({ id: objectId }), body: transitionSchema }),
  async (req, res) => {
    const leave = await LeaveRequest.findById(req.validated.params.id);
    if (!leave) throw ApiError.notFound('Leave request not found');
    await executeApprovalTransition(req.user, leave, { module: MODULES.HR, targetStatus: req.body.status, comment: req.body.comment });
    leave.updatedBy = req.user._id;
    await leave.save();
    sendSuccess(res, { id: String(leave._id), ...leave.toObject() }, { message: `Leave ${leave.status}` });
  },
);

/* Payroll Runs */
router.get('/payroll', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const rows = await PayrollRun.find(scope).populate('project', 'code name').sort({ createdAt: -1 }).lean();
  sendSuccess(res, rows.map((p) => ({ id: String(p._id), ...p })));
});

router.post('/payroll/runs', can(CREATE), validate({ body: createPayrollSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const start = new Date(`${req.body.month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  const [employees, attendance] = await Promise.all([
    Employee.find({
      status: 'active',
      $or: [{ assignedProjects: req.body.project }, { assignedProjects: { $size: 0 } }],
    }).lean(),
    AttendanceRecord.find({
      project: req.body.project,
      date: { $gte: start, $lt: end },
      status: { $in: ['present', 'half_day', 'leave'] },
    }).lean(),
  ]);

  const attByEmp = new Map();
  for (const a of attendance) {
    const k = String(a.employee);
    if (!attByEmp.has(k)) attByEmp.set(k, { days: 0, ot: 0 });
    const row = attByEmp.get(k);
    row.days += a.status === 'half_day' ? 0.5 : 1;
    row.ot += a.overtimeHours || 0;
  }

  let totalGross = 0;
  let totalNet = 0;
  const entries = employees.map((emp) => {
    const stat = attByEmp.get(String(emp._id)) ?? { days: 0, ot: 0 };
    const dailyEquivalent = emp.wageType === 'monthly' ? round2(emp.baseRate / 26) : emp.wageType === 'hourly' ? round2(emp.baseRate * 8) : emp.baseRate;
    const grossWage = round2(stat.days * dailyEquivalent);
    const overtimePay = round2(stat.ot * (emp.overtimeRate || 0));
    const pfDeduction = emp.workerCategory === WORKER_CATEGORIES.COMPANY_EMPLOYEE ? round2(grossWage * 0.12) : 0;
    const esicDeduction = emp.workerCategory === WORKER_CATEGORIES.COMPANY_EMPLOYEE ? round2(grossWage * 0.0075) : 0;
    const netPayable = round2(Math.max(0, grossWage + overtimePay - pfDeduction - esicDeduction));
    totalGross += round2(grossWage + overtimePay);
    totalNet += netPayable;
    return {
      employee: emp._id,
      empCode: emp.empCode,
      fullName: emp.fullName,
      workerCategory: emp.workerCategory,
      presentDays: stat.days,
      overtimeHours: stat.ot,
      grossWage,
      overtimePay,
      pfDeduction,
      esicDeduction,
      advanceDeduction: 0,
      netPayable,
    };
  });

  const runNumber = await nextSequenceNumber('payrollRun', { prefixOverride: 'PAYR', minPadding: 3 });
  const run = await PayrollRun.create({
    runNumber,
    project: req.body.project,
    month: req.body.month,
    entries,
    totalGross: round2(totalGross),
    totalNet: round2(totalNet),
    notes: req.body.notes,
    status: APPROVAL_STATUS.DRAFT,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await run.populate('project', 'code name');
  sendSuccess(res, { id: String(run._id), ...run.toObject() }, { status: 201, message: `Payroll run ${runNumber} generated` });
});

router.post(
  '/payroll/:id/transition',
  authorize(MODULES.HR, CREATE, UPDATE, APPROVE, REJECT),
  validate({ params: z.object({ id: objectId }), body: transitionSchema }),
  async (req, res) => {
    const scope = buildProjectScope(req.user, { projectField: 'project' });
    const run = await PayrollRun.findOne({ $and: [scope, { _id: req.validated.params.id }] });
    if (!run) throw ApiError.notFound('Payroll run not found');
    await executeApprovalTransition(req.user, run, { module: MODULES.HR, targetStatus: req.body.status, comment: req.body.comment });
    run.updatedBy = req.user._id;
    await run.save();
    recordAudit(req, { action: `payroll.${run.status}`, module: MODULES.HR, entityType: 'PayrollRun', entityId: run._id, project: run.project, summary: `${run.runNumber} -> ${run.status}` });
    sendSuccess(res, { id: String(run._id), ...run.toObject() }, { message: `Payroll run ${run.status}` });
  },
);

export default router;

