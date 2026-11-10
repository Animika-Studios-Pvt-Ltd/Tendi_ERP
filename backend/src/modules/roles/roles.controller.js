import { sendSuccess } from '../../utils/apiResponse.js';
import * as service from './roles.service.js';

export async function list(req, res) {
  const roles = await service.listRoles(req.query);
  sendSuccess(res, roles);
}

export async function get(req, res) {
  const role = await service.getRole(req.params.id);
  sendSuccess(res, role);
}

export async function update(req, res) {
  const role = await service.updateRole(req.user, req.params.id, req.body);
  sendSuccess(res, role, { message: 'Role permissions updated successfully' });
}

