import { MODULES } from '../../config/rbac.js';
import { recordAudit } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as controlService from './control.service.js';
import * as service from './projects.service.js';

const audit = (req, action, project, extra = {}) =>
  recordAudit(req, {
    action,
    module: MODULES.PROJECTS,
    entityType: 'Project',
    entityId: project._id,
    project: project._id,
    ...extra,
  });

export async function list(req, res) {
  const { items, meta } = await service.listProjects(req.user, req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function get(req, res) {
  const project = await service.getAccessibleProject(req.user, req.validated.params.id, { lean: true });
  sendSuccess(res, service.toProjectDto(project));
}

export async function create(req, res) {
  const project = await service.createProject(req.user, req.body);
  audit(req, 'project.create', project, { summary: `Created project ${project.code}` });
  sendSuccess(res, service.toProjectDto(project), { status: 201, message: 'Project created' });
}

export async function update(req, res) {
  const project = await service.updateProject(req.user, req.validated.params.id, req.body);
  audit(req, 'project.update', project, { summary: `Updated project ${project.code}`, changes: { fields: Object.keys(req.body) } });
  sendSuccess(res, service.toProjectDto(project), { message: 'Project updated' });
}

export async function team(req, res) {
  sendSuccess(res, await service.listTeam(req.user, req.validated.params.id));
}

export async function addMember(req, res) {
  const result = await service.addTeamMember(req.user, req.validated.params.id, req.body);
  const { project, member, assignedCount } = result;
  audit(req, 'project.team_add', project, {
    summary: `Added ${assignedCount > 1 ? `${assignedCount} members` : member?.email} to ${project.code}`,
    changes: { userIds: req.body.userIds || [req.body.userId] },
  });
  sendSuccess(res, result, { status: 201, message: assignedCount > 1 ? `${assignedCount} team members added` : 'Team member added' });
}

export async function removeMember(req, res) {
  const { userId } = req.validated.params;
  const { project } = await service.removeTeamMember(req.user, req.validated.params.id, userId);
  audit(req, 'project.team_remove', project, { summary: `Removed a member from ${project.code}`, changes: { userId } });
  sendSuccess(res, null, { message: 'Team member removed' });
}

export async function lookupUsers(req, res) {
  sendSuccess(res, await service.lookupUsers(req.validated.query));
}

/* BASELINE */

export async function freezeBaseline(req, res) {
  const project = await controlService.freezeBaseline(req.user, req.validated.params.id, req.body);
  recordAudit(req, {
    action: 'project.baseline_freeze',
    module: MODULES.PROJECTS,
    entityType: 'Project',
    entityId: project.id,
    project: project.id,
    summary: `Froze baseline for project ${project.code}`,
  });
  sendSuccess(res, project, { message: 'Project baseline frozen' });
}

/* RISKS */

export async function listRisks(req, res) {
  const items = await controlService.listRisks(req.user, req.validated.params.id, req.validated.query);
  sendSuccess(res, items);
}

export async function createRisk(req, res) {
  const risk = await controlService.createRisk(req.user, req.validated.params.id, req.body);
  recordAudit(req, {
    action: 'risk.create',
    module: MODULES.PROJECTS,
    entityType: 'ProjectRisk',
    entityId: risk.id,
    project: risk.project,
    summary: `Logged risk ${risk.riskNumber} (${risk.title})`,
  });
  sendSuccess(res, risk, { status: 201, message: 'Risk logged successfully' });
}

export async function updateRisk(req, res) {
  const risk = await controlService.updateRisk(req.user, req.validated.params.id, req.validated.params.riskId, req.body);
  recordAudit(req, {
    action: 'risk.update',
    module: MODULES.PROJECTS,
    entityType: 'ProjectRisk',
    entityId: risk.id,
    project: risk.project,
    summary: `Updated risk ${risk.riskNumber}`,
  });
  sendSuccess(res, risk, { message: 'Risk updated' });
}

export async function deleteRisk(req, res) {
  const result = await controlService.deleteRisk(req.user, req.validated.params.id, req.validated.params.riskId);
  recordAudit(req, {
    action: 'risk.delete',
    module: MODULES.PROJECTS,
    entityType: 'ProjectRisk',
    entityId: result.id,
    project: result.project,
    summary: `Deleted risk ${result.riskNumber}`,
  });
  sendSuccess(res, null, { message: 'Risk deleted' });
}

/* CHANGE ORDERS */

export async function listChangeOrders(req, res) {
  const items = await controlService.listChangeOrders(req.user, req.validated.params.id, req.validated.query);
  sendSuccess(res, items);
}

export async function createChangeOrder(req, res) {
  const co = await controlService.createChangeOrder(req.user, req.validated.params.id, req.body);
  recordAudit(req, {
    action: 'change_order.create',
    module: MODULES.PROJECTS,
    entityType: 'ChangeOrder',
    entityId: co.id,
    project: co.project,
    summary: `Drafted change order ${co.changeNumber} (${co.title})`,
  });
  sendSuccess(res, co, { status: 201, message: 'Change order drafted' });
}

export async function updateChangeOrder(req, res) {
  const co = await controlService.updateChangeOrder(req.user, req.validated.params.id, req.validated.params.changeId, req.body);
  recordAudit(req, {
    action: 'change_order.update',
    module: MODULES.PROJECTS,
    entityType: 'ChangeOrder',
    entityId: co.id,
    project: co.project,
    summary: `Updated change order ${co.changeNumber}`,
  });
  sendSuccess(res, co, { message: 'Change order updated' });
}

export async function transitionChangeOrder(req, res) {
  const co = await controlService.transitionChangeOrder(req.user, req.validated.params.id, req.validated.params.changeId, req.body);
  recordAudit(req, {
    action: `change_order.${co.status}`,
    module: MODULES.PROJECTS,
    entityType: 'ChangeOrder',
    entityId: co.id,
    project: co.project,
    summary: `Change order ${co.changeNumber} transitioned to "${co.status}"`,
    changes: { comment: req.body.comment },
  });
  sendSuccess(res, co, { message: `Change order ${co.status}` });
}

/* READINESS & CLOSURE */

export async function getReadiness(req, res) {
  const data = await controlService.getProjectReadiness(req.user, req.validated.params.id);
  sendSuccess(res, data);
}

export async function closeProject(req, res) {
  const project = await controlService.closeProject(req.user, req.validated.params.id, req.body);
  recordAudit(req, {
    action: 'project.close',
    module: MODULES.PROJECTS,
    entityType: 'Project',
    entityId: project.id,
    project: project.id,
    summary: `Closed project ${project.code}`,
  });
  sendSuccess(res, project, { message: 'Project closed successfully' });
}
