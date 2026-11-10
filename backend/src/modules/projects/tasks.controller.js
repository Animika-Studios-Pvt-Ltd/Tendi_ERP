import { MODULES } from '../../config/rbac.js';
import { recordAudit } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as taskService from './tasks.service.js';

const audit = (req, action, extra = {}) =>
  recordAudit(req, {
    action,
    module: MODULES.PROJECTS,
    ...extra,
  });

/* TASKS */

export async function listTasks(req, res) {
  const { items, meta } = await taskService.listTasks(req.user, req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function getTask(req, res) {
  const task = await taskService.getTaskById(req.user, req.validated.params.id);
  sendSuccess(res, task);
}

export async function createTask(req, res) {
  const task = await taskService.createTask(req.user, req.body);
  audit(req, 'task.create', {
    entityType: 'Task',
    entityId: task.id,
    project: task.project?.id,
    summary: `Created task ${task.code} (${task.title})`,
  });
  sendSuccess(res, task, { status: 201, message: 'Task created successfully' });
}

export async function updateTask(req, res) {
  const task = await taskService.updateTask(req.user, req.validated.params.id, req.body);
  audit(req, 'task.update', {
    entityType: 'Task',
    entityId: task.id,
    project: task.project?.id,
    summary: `Updated task ${task.code} (${task.title})`,
  });
  sendSuccess(res, task, { message: 'Task updated successfully' });
}

export async function deleteTask(req, res) {
  const result = await taskService.deleteTask(req.user, req.validated.params.id);
  audit(req, 'task.delete', {
    entityType: 'Task',
    entityId: result.id,
    project: result.project,
    summary: `Deleted task ${result.code}`,
  });
  sendSuccess(res, null, { message: 'Task deleted successfully' });
}

/* MILESTONES */

export async function listMilestones(req, res) {
  const { items, meta } = await taskService.listMilestones(req.user, req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function getMilestone(req, res) {
  const milestone = await taskService.getMilestoneById(req.user, req.validated.params.id);
  sendSuccess(res, milestone);
}

export async function createMilestone(req, res) {
  const milestone = await taskService.createMilestone(req.user, req.body);
  audit(req, 'milestone.create', {
    entityType: 'Milestone',
    entityId: milestone.id,
    project: milestone.project?.id,
    summary: `Created milestone ${milestone.title}`,
  });
  sendSuccess(res, milestone, { status: 201, message: 'Milestone created successfully' });
}

export async function updateMilestone(req, res) {
  const milestone = await taskService.updateMilestone(req.user, req.validated.params.id, req.body);
  audit(req, 'milestone.update', {
    entityType: 'Milestone',
    entityId: milestone.id,
    project: milestone.project?.id,
    summary: `Updated milestone ${milestone.title}`,
  });
  sendSuccess(res, milestone, { message: 'Milestone updated successfully' });
}

export async function deleteMilestone(req, res) {
  const result = await taskService.deleteMilestone(req.user, req.validated.params.id);
  audit(req, 'milestone.delete', {
    entityType: 'Milestone',
    entityId: result.id,
    project: result.project,
    summary: `Deleted milestone ${result.title}`,
  });
  sendSuccess(res, null, { message: 'Milestone deleted successfully' });
}

