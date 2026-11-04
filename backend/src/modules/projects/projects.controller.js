import { MODULES } from '../../config/rbac.js';
import { recordAudit } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
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
  const { project, member } = await service.addTeamMember(req.user, req.validated.params.id, req.body.userId);
  audit(req, 'project.team_add', project, { summary: `Added ${member.email} to ${project.code}`, changes: { userId: String(member._id) } });
  sendSuccess(res, null, { status: 201, message: 'Team member added' });
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
