import { MODULES, ROLES } from '../../config/rbac.js';
import { ChangeOrder } from '../../models/ChangeOrder.js';
import { DailyProgressReport } from '../../models/DailyProgressReport.js';
import { MaterialRequest } from '../../models/MaterialRequest.js';
import { Milestone, MILESTONE_STATUS } from '../../models/Milestone.js';
import { NOTIFICATION_TYPES } from '../../models/Notification.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { PROJECT_STATUS } from '../../models/Project.js';
import { computeRiskSeverity, ProjectRisk, RISK_STATUS } from '../../models/ProjectRisk.js';
import { PurchaseOrder } from '../../models/PurchaseOrder.js';
import { Task, TASK_STATUS } from '../../models/Task.js';
import { User, USER_STATUS } from '../../models/User.js';
import { executeApprovalTransition } from '../../services/approval.service.js';
import { notifyProjectApprovers, notifyUsers } from '../../services/notification.service.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { getAccessibleProject, toProjectDto } from './projects.service.js';

const PERSON_SELECT = 'firstName lastName email designation';
const isAdminRole = (user) => [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN].includes(user?.role?.key);
const fullName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ');
const toPerson = (p) =>
  p?._id ? { id: String(p._id), fullName: fullName(p), email: p.email, designation: p.designation ?? '' } : null;
const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function toRiskDto(doc) {
  const r = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(r._id),
    riskNumber: r.riskNumber,
    project: String(r.project),
    title: r.title,
    description: r.description ?? '',
    category: r.category,
    probability: r.probability,
    impact: r.impact,
    severity: r.severity,
    mitigationPlan: r.mitigationPlan ?? '',
    owner: toPerson(r.owner),
    dueDate: r.dueDate ?? null,
    status: r.status,
    createdBy: toPerson(r.createdBy),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function toChangeOrderDto(doc) {
  const c = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(c._id),
    changeNumber: c.changeNumber,
    project: String(c.project),
    title: c.title,
    description: c.description ?? '',
    type: c.type,
    costImpact: c.costImpact ?? 0,
    scheduleImpactDays: c.scheduleImpactDays ?? 0,
    reason: c.reason ?? '',
    clientApprovalRequired: Boolean(c.clientApprovalRequired),
    clientApproved: Boolean(c.clientApproved),
    appliedAt: c.appliedAt ?? null,
    status: c.status,
    submittedBy: toPerson(c.submittedBy),
    submittedAt: c.submittedAt ?? null,
    decidedBy: toPerson(c.decidedBy),
    decidedAt: c.decidedAt ?? null,
    decisionComment: c.decisionComment ?? '',
    approvalHistory: (c.approvalHistory ?? []).map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      by: toPerson(h.by),
      comment: h.comment ?? '',
      at: h.at,
    })),
    createdBy: toPerson(c.createdBy),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/* =========================================================================
 * BASELINE MANAGEMENT
 * ========================================================================= */

export async function freezeBaseline(user, projectId, { notes = '', rebaseline = false } = {}) {
  const project = await getAccessibleProject(user, projectId);

  if (project.baseline?.lockedAt && !rebaseline) {
    throw ApiError.badRequest(
      'Project baseline is already frozen. Use an approved Change Order for revisions or Admin re-baseline.',
    );
  }
  if (rebaseline && !isAdminRole(user)) {
    throw ApiError.forbidden('Only Company Admin or Super Admin can overwrite a frozen baseline');
  }

  project.baseline = {
    startDate: project.startDate ?? null,
    plannedEndDate: project.plannedEndDate ?? null,
    contractValue: project.contractValue ?? 0,
    progressPercent: project.progressPercent ?? 0,
    lockedAt: new Date(),
    lockedBy: user._id,
    notes: notes || '',
  };
  project.updatedBy = user._id;
  await project.save();

  // Snapshot task baseline dates
  const tasks = await Task.find({ project: project._id });
  await Promise.all(
    tasks.map((t) => {
      if (rebaseline || (!t.baselineStartDate && !t.baselineDueDate)) {
        t.baselineStartDate = t.startDate;
        t.baselineDueDate = t.dueDate;
        return t.save();
      }
      return null;
    }),
  );

  await project.populate('projectManager baseline.lockedBy closureChecklist.closedBy', PERSON_SELECT);
  return toProjectDto(project);
}

/* =========================================================================
 * RISK REGISTER
 * ========================================================================= */

export async function listRisks(user, projectId, query = {}) {
  const project = await getAccessibleProject(user, projectId, { lean: true });
  const filter = { project: project._id };
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.severity) filter.severity = query.severity;
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ title: rx }, { riskNumber: rx }, { description: rx }];
  }

  const risks = await ProjectRisk.find(filter)
    .populate('owner', PERSON_SELECT)
    .populate('createdBy', PERSON_SELECT)
    .sort({ createdAt: -1 });
  return risks.map(toRiskDto);
}

export async function createRisk(user, projectId, input) {
  const project = await getAccessibleProject(user, projectId, { lean: true });
  if (input.owner) {
    const owner = await User.findOne({ _id: input.owner, status: USER_STATUS.ACTIVE }).select('_id');
    if (!owner) throw ApiError.validation([{ field: 'owner', message: 'Choose an active owner' }]);
  }

  const riskNumber = await nextSequenceNumber('risk', {
    scopeKey: String(project._id),
    contextCode: project.code,
    prefixOverride: 'RSK',
    minPadding: 3,
  });

  const severity = computeRiskSeverity(input.probability, input.impact);
  const risk = await ProjectRisk.create({
    ...input,
    riskNumber,
    project: project._id,
    severity,
    createdBy: user._id,
    updatedBy: user._id,
  });

  await risk.populate('owner createdBy', PERSON_SELECT);
  return toRiskDto(risk);
}

export async function updateRisk(user, projectId, riskId, input) {
  const project = await getAccessibleProject(user, projectId, { lean: true });
  const risk = await ProjectRisk.findOne({ _id: riskId, project: project._id });
  if (!risk) throw ApiError.notFound('Risk record not found');

  if (input.owner) {
    const owner = await User.findOne({ _id: input.owner, status: USER_STATUS.ACTIVE }).select('_id');
    if (!owner) throw ApiError.validation([{ field: 'owner', message: 'Choose an active owner' }]);
  }

  Object.assign(risk, input);
  risk.severity = computeRiskSeverity(risk.probability, risk.impact);
  risk.updatedBy = user._id;
  await risk.save();

  await risk.populate('owner createdBy', PERSON_SELECT);
  return toRiskDto(risk);
}

export async function deleteRisk(user, projectId, riskId) {
  const project = await getAccessibleProject(user, projectId, { lean: true });
  const risk = await ProjectRisk.findOneAndDelete({ _id: riskId, project: project._id });
  if (!risk) throw ApiError.notFound('Risk record not found');
  return { id: String(risk._id), riskNumber: risk.riskNumber, project: project._id };
}

/* =========================================================================
 * CHANGE REQUESTS & VARIATION ORDERS
 * ========================================================================= */

export async function listChangeOrders(user, projectId, query = {}) {
  const project = await getAccessibleProject(user, projectId, { lean: true });
  const filter = { project: project._id };
  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ title: rx }, { changeNumber: rx }, { reason: rx }];
  }

  const items = await ChangeOrder.find(filter)
    .populate('createdBy submittedBy decidedBy approvalHistory.by', PERSON_SELECT)
    .sort({ createdAt: -1 });
  return items.map(toChangeOrderDto);
}

export async function createChangeOrder(user, projectId, input) {
  const project = await getAccessibleProject(user, projectId, { lean: true });
  const changeNumber = await nextSequenceNumber('changeOrder', {
    scopeKey: String(project._id),
    contextCode: project.code,
    prefixOverride: 'CO',
    minPadding: 3,
  });

  const co = await ChangeOrder.create({
    ...input,
    changeNumber,
    project: project._id,
    status: APPROVAL_STATUS.DRAFT,
    createdBy: user._id,
    updatedBy: user._id,
  });

  await co.populate('createdBy', PERSON_SELECT);
  return toChangeOrderDto(co);
}

export async function updateChangeOrder(user, projectId, changeId, input) {
  const project = await getAccessibleProject(user, projectId, { lean: true });
  const co = await ChangeOrder.findOne({ _id: changeId, project: project._id });
  if (!co) throw ApiError.notFound('Change order not found');

  if (![APPROVAL_STATUS.DRAFT, APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.RETURNED].includes(co.status)) {
    throw ApiError.badRequest(`Cannot edit change order in "${co.status}" status`);
  }

  Object.assign(co, input);
  co.updatedBy = user._id;
  await co.save();
  await co.populate('createdBy submittedBy decidedBy approvalHistory.by', PERSON_SELECT);
  return toChangeOrderDto(co);
}

export async function transitionChangeOrder(user, projectId, changeId, { status: targetStatus, comment, clientApproved }) {
  const project = await getAccessibleProject(user, projectId);
  const co = await ChangeOrder.findOne({ _id: changeId, project: project._id });
  if (!co) throw ApiError.notFound('Change order not found');

  if (clientApproved !== undefined) {
    co.clientApproved = Boolean(clientApproved);
  }

  if (targetStatus === APPROVAL_STATUS.APPROVED && co.clientApprovalRequired && !co.clientApproved) {
    throw ApiError.badRequest('Client approval confirmation is required before approving this variation order');
  }

  await executeApprovalTransition(user, co, {
    module: MODULES.PROJECTS,
    targetStatus,
    comment,
  });

  if (targetStatus === APPROVAL_STATUS.APPROVED && !co.appliedAt) {
    const nextValue = (project.contractValue ?? 0) + (co.costImpact ?? 0);
    if (nextValue < 0) {
      throw ApiError.badRequest('Change order negative cost impact exceeds current project contract value');
    }
    project.contractValue = nextValue;
    if (project.plannedEndDate && co.scheduleImpactDays) {
      project.plannedEndDate = new Date(project.plannedEndDate.getTime() + co.scheduleImpactDays * 86400000);
    }
    project.updatedBy = user._id;
    await project.save();
    co.appliedAt = new Date();
  }

  co.updatedBy = user._id;
  await co.save();

  if (targetStatus === APPROVAL_STATUS.SUBMITTED) {
    await notifyProjectApprovers({
      projectId: project._id,
      module: MODULES.PROJECTS,
      excludeUserId: user._id,
      title: `Change Order ${co.changeNumber} awaiting approval`,
      message: `${co.title} (Cost impact: ₹${co.costImpact}, Schedule: ${co.scheduleImpactDays}d)`,
      entityType: 'ChangeOrder',
      entityId: co._id,
      link: `/projects/${project._id}`,
      createdBy: user._id,
    });
  } else if ([APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.RETURNED].includes(targetStatus)) {
    const recipient = co.submittedBy || co.createdBy;
    if (recipient && String(recipient) !== String(user._id)) {
      await notifyUsers([recipient], {
        type: NOTIFICATION_TYPES.APPROVAL_DECIDED,
        title: `Change Order ${co.changeNumber} ${targetStatus}`,
        message: comment || `Change order "${co.title}" was ${targetStatus}.`,
        module: MODULES.PROJECTS,
        entityType: 'ChangeOrder',
        entityId: co._id,
        project: project._id,
        link: `/projects/${project._id}`,
        createdBy: user._id,
      });
    }
  }

  await co.populate('createdBy submittedBy decidedBy approvalHistory.by', PERSON_SELECT);
  return toChangeOrderDto(co);
}

/* =========================================================================
 * PROJECT READINESS & CLOSURE GATE
 * ========================================================================= */

export async function getProjectReadiness(user, projectId) {
  const project = await getAccessibleProject(user, projectId, { lean: true });

  const [
    openTasks,
    pendingMilestones,
    pendingDprs,
    pendingMrs,
    openPos,
    highOpenRisks,
    pendingChangeOrders,
  ] = await Promise.all([
    Task.countDocuments({ project: project._id, status: { $ne: TASK_STATUS.COMPLETED } }),
    Milestone.countDocuments({ project: project._id, status: { $ne: MILESTONE_STATUS.ACHIEVED } }),
    DailyProgressReport.countDocuments({
      project: project._id,
      status: { $in: [APPROVAL_STATUS.DRAFT, APPROVAL_STATUS.SUBMITTED, APPROVAL_STATUS.UNDER_REVIEW, APPROVAL_STATUS.RETURNED] },
    }),
    MaterialRequest.countDocuments({
      project: project._id,
      status: { $in: [APPROVAL_STATUS.DRAFT, APPROVAL_STATUS.SUBMITTED, APPROVAL_STATUS.UNDER_REVIEW, APPROVAL_STATUS.RETURNED] },
    }),
    PurchaseOrder.countDocuments({
      project: project._id,
      status: { $in: [APPROVAL_STATUS.DRAFT, APPROVAL_STATUS.SUBMITTED, APPROVAL_STATUS.UNDER_REVIEW] },
    }),
    ProjectRisk.countDocuments({
      project: project._id,
      status: { $in: [RISK_STATUS.OPEN, RISK_STATUS.OCCURRED] },
      severity: { $in: ['high', 'critical'] },
    }),
    ChangeOrder.countDocuments({
      project: project._id,
      status: { $in: [APPROVAL_STATUS.DRAFT, APPROVAL_STATUS.SUBMITTED, APPROVAL_STATUS.UNDER_REVIEW, APPROVAL_STATUS.RETURNED] },
    }),
  ]);

  const checklist = {
    finalInspectionCompleted: Boolean(project.closureChecklist?.finalInspectionCompleted),
    punchListCleared: Boolean(project.closureChecklist?.punchListCleared),
    asBuiltSubmitted: Boolean(project.closureChecklist?.asBuiltSubmitted),
    finalAccountsSettled: Boolean(project.closureChecklist?.finalAccountsSettled),
    clientHandoverCompleted: Boolean(project.closureChecklist?.clientHandoverCompleted),
    warrantyMonths: project.closureChecklist?.warrantyMonths ?? 12,
    remarks: project.closureChecklist?.remarks ?? '',
    closedAt: project.closureChecklist?.closedAt ?? null,
  };

  const blockers = [];
  if (openTasks > 0) blockers.push(`${openTasks} open task(s) remaining`);
  if (pendingMilestones > 0) blockers.push(`${pendingMilestones} milestone(s) not marked achieved`);
  if (pendingDprs > 0) blockers.push(`${pendingDprs} pending DPR(s) awaiting approval`);
  if (pendingMrs > 0) blockers.push(`${pendingMrs} pending Material Request(s)`);
  if (openPos > 0) blockers.push(`${openPos} draft/unapproved Purchase Order(s)`);
  if (highOpenRisks > 0) blockers.push(`${highOpenRisks} unresolved high/critical risk(s)`);
  if (pendingChangeOrders > 0) blockers.push(`${pendingChangeOrders} pending Change Order(s)`);

  return {
    projectId: String(project._id),
    status: project.status,
    ready: blockers.length === 0,
    blockers,
    metrics: {
      openTasks,
      pendingMilestones,
      pendingDprs,
      pendingMrs,
      openPos,
      highOpenRisks,
      pendingChangeOrders,
    },
    checklist,
  };
}

export async function closeProject(user, projectId, input = {}) {
  const project = await getAccessibleProject(user, projectId);
  if (project.status === PROJECT_STATUS.COMPLETED) {
    throw ApiError.badRequest('Project is already closed');
  }

  const nextChecklist = {
    finalInspectionCompleted: input.closureChecklist?.finalInspectionCompleted ?? project.closureChecklist?.finalInspectionCompleted ?? false,
    punchListCleared: input.closureChecklist?.punchListCleared ?? project.closureChecklist?.punchListCleared ?? false,
    asBuiltSubmitted: input.closureChecklist?.asBuiltSubmitted ?? project.closureChecklist?.asBuiltSubmitted ?? false,
    finalAccountsSettled: input.closureChecklist?.finalAccountsSettled ?? project.closureChecklist?.finalAccountsSettled ?? false,
    clientHandoverCompleted: input.closureChecklist?.clientHandoverCompleted ?? project.closureChecklist?.clientHandoverCompleted ?? false,
    warrantyMonths: input.closureChecklist?.warrantyMonths ?? project.closureChecklist?.warrantyMonths ?? 12,
    remarks: input.closureChecklist?.remarks ?? project.closureChecklist?.remarks ?? '',
  };

  const readiness = await getProjectReadiness(user, project._id);
  const missingChecklist = [
    !nextChecklist.finalInspectionCompleted && 'Final inspection completed',
    !nextChecklist.punchListCleared && 'Punch list cleared',
    !nextChecklist.asBuiltSubmitted && 'As-built drawings submitted',
    !nextChecklist.finalAccountsSettled && 'Final accounts settled',
    !nextChecklist.clientHandoverCompleted && 'Client handover completed',
  ].filter(Boolean);

  const allBlockers = [
    ...readiness.blockers,
    ...missingChecklist.map((item) => `Checklist pending: ${item}`),
  ];

  if (allBlockers.length > 0) {
    if (!input.forceClose) {
      throw ApiError.badRequest(`Project is not ready for closure: ${allBlockers.join('; ')}`);
    }
    if (!isAdminRole(user)) {
      throw ApiError.forbidden('Only Super Admin or Company Admin can force-close a project with pending items');
    }
  }

  project.closureChecklist = {
    ...nextChecklist,
    closedBy: user._id,
    closedAt: new Date(),
  };
  project.status = PROJECT_STATUS.COMPLETED;
  project.actualEndDate = input.actualEndDate ?? new Date();
  project.progressPercent = 100;
  project.updatedBy = user._id;
  await project.save();

  await project.populate('projectManager baseline.lockedBy closureChecklist.closedBy', PERSON_SELECT);
  return toProjectDto(project);
}

