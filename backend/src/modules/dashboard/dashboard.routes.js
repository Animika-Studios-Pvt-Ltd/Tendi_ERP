import { Router } from 'express';
import mongoose from 'mongoose';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { ClientComplaint, Enquiry, ProjectHandover } from '../../models/Crm.js';
import { ContractorBill, WorkOrder } from '../../models/Contractor.js';
import { DailyProgressReport } from '../../models/DailyProgressReport.js';
import { Equipment, EquipmentLog } from '../../models/Equipment.js';
import { Expense, Invoice, Payment, ProjectBudget } from '../../models/Finance.js';
import { AttendanceRecord, Employee, PayrollRun } from '../../models/Hr.js';
import { InventoryTransaction, TRANSACTION_TYPES } from '../../models/InventoryTransaction.js';
import { PermitLicense } from '../../models/Legal.js';
import { MaterialRequest } from '../../models/MaterialRequest.js';
import { Milestone } from '../../models/Milestone.js';
import { Notification } from '../../models/Notification.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { Project, PROJECT_STATUS } from '../../models/Project.js';
import { PurchaseOrder } from '../../models/PurchaseOrder.js';
import { NonConformanceReport, QualityInspection, SafetyIncident } from '../../models/QualitySafety.js';
import { Task, TASK_STATUS } from '../../models/Task.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';

const canUser = (user, module, action = ACTIONS.READ) =>
  typeof user?.can === 'function' ? user.can(module, action) : Boolean(user?.role?.can?.(module, action));
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function toObjectIdMatch(scope, projectField, selectedProjectId) {
  const out = {};
  if (selectedProjectId && mongoose.isValidObjectId(selectedProjectId)) {
    out[projectField] = new mongoose.Types.ObjectId(selectedProjectId);
    return out;
  }
  if (scope[projectField]?.$in) {
    out[projectField] = { $in: scope[projectField].$in.map((id) => new mongoose.Types.ObjectId(id)) };
  }
  return out;
}

const router = Router();
router.use(authenticate);

router.get('/summary', authorize(MODULES.DASHBOARD, ACTIONS.READ), async (req, res) => {
  const user = req.user;
  const selectedProject = req.query.project && mongoose.isValidObjectId(req.query.project) ? req.query.project : null;
  if (selectedProject && !canAccessProject(user, selectedProject)) {
    return sendSuccess(res, { portfolio: { totalProjects: 0, activeProjects: 0, completedProjects: 0 }, alerts: [] });
  }

  const projScope = buildProjectScope(user, { projectField: '_id' });
  const childScope = buildProjectScope(user, { projectField: 'project' });
  const projMatch = toObjectIdMatch(projScope, '_id', selectedProject);
  const childMatch = toObjectIdMatch(childScope, 'project', selectedProject);
  const now = new Date();

  const [projects, openTasks, delayedTasks, delayedMilestones, recentDprs, unreadNotifications] = await Promise.all([
    Project.find(projMatch).select('code name status contractValue progressPercent startDate plannedEndDate').lean(),
    Task.countDocuments({ ...childMatch, status: { $ne: TASK_STATUS.COMPLETED } }),
    Task.countDocuments({ ...childMatch, status: { $ne: TASK_STATUS.COMPLETED }, dueDate: { $lt: now } }),
    Milestone.countDocuments({ ...childMatch, status: { $ne: 'achieved' }, targetDate: { $lt: now } }),
    DailyProgressReport.find(childMatch)
      .sort({ reportDate: -1 })
      .limit(5)
      .populate('project', 'code name')
      .populate('site', 'code name')
      .lean(),
    Notification.countDocuments({ recipient: user._id, isRead: false }),
  ]);

  const portfolio = {
    totalProjects: projects.length,
    activeProjects: projects.filter((p) => p.status === PROJECT_STATUS.ACTIVE).length,
    planningProjects: projects.filter((p) => p.status === PROJECT_STATUS.PLANNING).length,
    completedProjects: projects.filter((p) => p.status === PROJECT_STATUS.COMPLETED).length,
    totalContractValue: round2(projects.reduce((s, p) => s + (p.contractValue || 0), 0)),
    avgProgress: projects.length ? Math.round(projects.reduce((s, p) => s + (p.progressPercent || 0), 0) / projects.length) : 0,
    openTasks,
    delayedTasks,
    delayedMilestones,
  };

  let procurement = null;
  if (canUser(user, MODULES.PROCUREMENT)) {
    const [pendingMrs, pendingPos, poTotals] = await Promise.all([
      MaterialRequest.countDocuments({ ...childMatch, status: { $in: [APPROVAL_STATUS.SUBMITTED, APPROVAL_STATUS.UNDER_REVIEW] } }),
      PurchaseOrder.countDocuments({ ...childMatch, status: { $in: [APPROVAL_STATUS.SUBMITTED, APPROVAL_STATUS.UNDER_REVIEW] } }),
      PurchaseOrder.aggregate([
        { $match: { ...childMatch, status: { $ne: APPROVAL_STATUS.CANCELLED } } },
        { $group: { _id: '$status', total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
      ]),
    ]);
    const totalPoSpend = round2(poTotals.reduce((s, r) => s + (r.total || 0), 0));
    procurement = { pendingMrs, pendingPos, totalPoSpend, byStatus: poTotals };
  }

  let inventory = null;
  if (canUser(user, MODULES.INVENTORY)) {
    const stockAgg = await InventoryTransaction.aggregate([
      { $match: childMatch },
      { $group: { _id: { project: '$project', material: '$material' }, balance: { $sum: '$delta' } } },
      { $lookup: { from: 'materials', localField: '_id.material', foreignField: '_id', as: 'mat' } },
      { $unwind: '$mat' },
    ]);
    const lowStockItems = stockAgg
      .filter((s) => s.balance <= (s.mat.reorderLevel ?? 0))
      .slice(0, 8)
      .map((s) => ({
        materialCode: s.mat.code,
        materialName: s.mat.name,
        unit: s.mat.unit,
        currentStock: round2(s.balance),
        reorderLevel: s.mat.reorderLevel ?? 0,
      }));
    const stockValuation = round2(stockAgg.reduce((s, x) => s + x.balance * (x.mat.standardRate || 0), 0));
    inventory = { lowStockCount: stockAgg.filter((s) => s.balance <= (s.mat.reorderLevel ?? 0)).length, stockValuation, lowStockItems };
  }

  let finance = null;
  if (canUser(user, MODULES.FINANCE)) {
    const [budgets, expenses, matIssues, bills, payroll, payments] = await Promise.all([
      ProjectBudget.aggregate([{ $match: childMatch }, { $group: { _id: null, original: { $sum: '$originalBudget' }, revised: { $sum: '$revisedBudget' } } }]),
      Expense.aggregate([{ $match: { ...childMatch, status: APPROVAL_STATUS.APPROVED } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      InventoryTransaction.aggregate([{ $match: { ...childMatch, type: TRANSACTION_TYPES.ISSUE } }, { $group: { _id: null, total: { $sum: '$totalValue' } } }]),
      ContractorBill.aggregate([{ $match: { ...childMatch, status: APPROVAL_STATUS.APPROVED } }, { $group: { _id: null, total: { $sum: '$netPayable' } } }]),
      PayrollRun.aggregate([{ $match: { ...childMatch, status: APPROVAL_STATUS.APPROVED } }, { $group: { _id: null, total: { $sum: '$totalNet' } } }]),
      Payment.aggregate([{ $match: childMatch }, { $group: { _id: '$direction', total: { $sum: '$amount' } } }]),
    ]);
    const revisedBudget = round2(budgets[0]?.revised || portfolio.totalContractValue);
    const actualSpend = round2(
      (expenses[0]?.total || 0) + (matIssues[0]?.total || 0) + (bills[0]?.total || 0) + (payroll[0]?.total || 0),
    );
    const inflow = round2(payments.find((p) => p._id === 'inflow')?.total || 0);
    const outflow = round2(payments.find((p) => p._id === 'outflow')?.total || 0);
    finance = { revisedBudget, actualSpend, inflow, outflow, netCashFlow: round2(inflow - outflow) };
  }

  let workforce = null;
  if (canUser(user, MODULES.HR) || canUser(user, MODULES.CONTRACTORS)) {
    const [activeWorkers, todayAttendance, activeWorkOrders] = await Promise.all([
      Employee.countDocuments({ status: 'active' }),
      AttendanceRecord.countDocuments({
        ...childMatch,
        date: { $gte: new Date(now.toISOString().slice(0, 10)) },
        status: { $in: ['present', 'half_day'] },
      }),
      WorkOrder.countDocuments({ ...childMatch, status: 'active' }),
    ]);
    workforce = { activeWorkers, todayAttendance, activeWorkOrders };
  }

  let qualitySafety = null;
  if (canUser(user, MODULES.QUALITY_SAFETY)) {
    const [openNcrs, inspections, incidents] = await Promise.all([
      NonConformanceReport.countDocuments({ ...childMatch, status: { $in: ['open', 'in_progress'] } }),
      QualityInspection.countDocuments(childMatch),
      SafetyIncident.countDocuments({ ...childMatch, status: { $ne: 'closed' } }),
    ]);
    qualitySafety = { openNcrs, inspections, openIncidents: incidents };
  }

  let equipment = null;
  if (canUser(user, MODULES.EQUIPMENT)) {
    const [deployed, maintenance] = await Promise.all([
      Equipment.countDocuments({ ...childMatch, status: 'deployed' }),
      Equipment.countDocuments({ ...childMatch, status: 'maintenance' }),
    ]);
    equipment = { deployed, inMaintenance: maintenance };
  }

  let legal = null;
  if (canUser(user, MODULES.LEGAL)) {
    const expiringSoon = await PermitLicense.countDocuments({
      expiryDate: { $lte: new Date(Date.now() + 30 * 86400000) },
    });
    legal = { expiringPermits: expiringSoon };
  }

  let crm = null;
  if (canUser(user, MODULES.CRM)) {
    const [openEnquiries, openComplaints, handovers] = await Promise.all([
      Enquiry.countDocuments({ stage: { $nin: ['won', 'lost'] } }),
      ClientComplaint.countDocuments({ ...childMatch, status: { $ne: 'closed' } }),
      ProjectHandover.countDocuments(childMatch),
    ]);
    crm = { openEnquiries, openComplaints, handovers };
  }

  const projectHealth = projects.slice(0, 8).map((p) => {
    const isDelayed = p.plannedEndDate && p.status !== PROJECT_STATUS.COMPLETED && new Date(p.plannedEndDate) < now;
    return {
      id: String(p._id),
      code: p.code,
      name: p.name,
      status: p.status,
      progressPercent: p.progressPercent || 0,
      contractValue: p.contractValue || 0,
      health: isDelayed ? 'delayed' : p.status === PROJECT_STATUS.ON_HOLD ? 'at_risk' : 'on_track',
    };
  });

  sendSuccess(res, {
    roleKey: user.role?.key,
    unreadNotifications,
    portfolio,
    projectHealth,
    recentDprs: recentDprs.map((d) => ({
      id: String(d._id),
      reportNumber: d.reportNumber,
      project: d.project?.code || '',
      site: d.site?.name || '',
      reportDate: d.reportDate,
      status: d.status,
    })),
    procurement,
    inventory,
    finance,
    workforce,
    qualitySafety,
    equipment,
    legal,
    crm,
  });
});

export default router;

