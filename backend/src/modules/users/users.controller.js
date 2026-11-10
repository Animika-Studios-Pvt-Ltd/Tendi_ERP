import { MODULES } from '../../config/rbac.js';
import { recordAudit } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as service from './users.service.js';

const audit = (req, action, user, extra = {}) =>
  recordAudit(req, {
    action,
    module: MODULES.USERS,
    entityType: 'User',
    entityId: user._id,
    ...extra,
  });

export async function list(req, res) {
  const { items, meta } = await service.listUsers(req.user, req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function get(req, res) {
  const user = await service.getUser(req.user, req.validated.params.id);
  sendSuccess(res, user);
}

export async function create(req, res) {
  const user = await service.createUser(req.user, req.body);
  audit(req, 'user.create', user, {
    summary: `Created user ${user.email} (${user.role.name})`,
  });
  sendSuccess(res, service.toUserDto(user), { status: 201, message: 'User created successfully' });
}

export async function update(req, res) {
  const user = await service.updateUser(req.user, req.validated.params.id, req.body);
  audit(req, 'user.update', user, {
    summary: `Updated user ${user.email}`,
    changes: { fields: Object.keys(req.body) },
  });
  sendSuccess(res, service.toUserDto(user), { message: 'User updated successfully' });
}

export async function setStatus(req, res) {
  const { status } = req.validated.body;
  const user = await service.setUserStatus(req.user, req.validated.params.id, status);
  audit(req, 'user.status_change', user, {
    summary: `Changed status of ${user.email} to ${status}`,
    changes: { status },
  });
  sendSuccess(res, service.toUserDto(user), { message: `User status changed to ${status}` });
}

export async function setPermissions(req, res) {
  const { permissionOverrides } = req.validated.body;
  const user = await service.setUserPermissions(req.user, req.validated.params.id, permissionOverrides);
  audit(req, 'user.permissions_override', user, {
    summary: `Updated permission overrides for ${user.email}`,
    changes: { count: permissionOverrides.length },
  });
  sendSuccess(res, service.toUserDto(user), { message: 'User permissions updated successfully' });
}

export async function assignProjects(req, res) {
  const user = await service.assignProjectsToUser(req.user, req.validated.params.id, req.validated.body);
  audit(req, 'user.assign_projects', user, {
    summary: `Assigned project(s) to ${user.email}`,
    changes: { projectIds: req.validated.body.projectIds || [req.validated.body.projectId] },
  });
  sendSuccess(res, user, { message: 'Project(s) assigned successfully' });
}

export async function removeProject(req, res) {
  const user = await service.removeProjectFromUser(req.user, req.validated.params.id, req.validated.params.projectId);
  audit(req, 'user.remove_project', user, {
    summary: `Removed project assignment from ${user.email}`,
    changes: { projectId: req.validated.params.projectId },
  });
  sendSuccess(res, user, { message: 'Project assignment removed successfully' });
}

export async function listAvailableProjects(req, res) {
  const projects = await service.listAvailableProjectsForUser(req.user, req.validated.params.id);
  sendSuccess(res, projects);
}

