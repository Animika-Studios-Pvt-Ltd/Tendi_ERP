import { ROLES } from '../../config/rbac.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';

export async function listRoles({ isActive } = {}) {
  const filter = {};
  if (isActive !== undefined) {
    filter.isActive = String(isActive) === 'true';
  }

  const roles = await Role.find(filter).sort({ name: 1 }).lean();

  // Aggregate user counts per role for convenience
  const counts = await User.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));

  return roles.map((role) => ({
    id: String(role._id),
    key: role.key,
    name: role.name,
    description: role.description ?? '',
    dataScope: role.dataScope,
    isSystem: role.isSystem ?? false,
    isActive: role.isActive ?? true,
    userCount: countMap[String(role._id)] ?? 0,
    permissions: role.permissions ?? [],
  }));
}

export async function getRole(idOrKey) {
  const query = /^[a-f\d]{24}$/i.test(idOrKey) ? { _id: idOrKey } : { key: idOrKey };
  const role = await Role.findOne(query);
  if (!role) {
    throw ApiError.notFound('Role not found');
  }

  const userCount = await User.countDocuments({ role: role._id });

  return {
    id: String(role._id),
    key: role.key,
    name: role.name,
    description: role.description ?? '',
    dataScope: role.dataScope,
    isSystem: role.isSystem ?? false,
    isActive: role.isActive ?? true,
    userCount,
    permissions: role.toPermissionMap ? role.toPermissionMap() : role.permissions,
  };
}

export async function updateRole(actor, idOrKey, data) {
  if (actor.role?.key !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only Super Admins can modify role permissions');
  }

  const query = /^[a-f\d]{24}$/i.test(idOrKey) ? { _id: idOrKey } : { key: idOrKey };
  const role = await Role.findOne(query);
  if (!role) {
    throw ApiError.notFound('Role not found');
  }

  if (data.name !== undefined) role.name = data.name;
  if (data.description !== undefined) role.description = data.description;

  if (data.permissions !== undefined) {
    let entries;
    if (Array.isArray(data.permissions)) {
      entries = data.permissions.map((p) => ({
        module: p.module,
        actions: [...new Set(p.actions)],
      }));
    } else {
      entries = Object.entries(data.permissions).map(([module, actions]) => ({
        module,
        actions: [...new Set(actions)],
      }));
    }

    // Safety: ensure Super Admin role retains management permissions
    if (role.key === ROLES.SUPER_ADMIN) {
      const usersGrant = entries.find((e) => e.module === 'users');
      if (!usersGrant || !usersGrant.actions.includes('update')) {
        throw ApiError.badRequest('Cannot remove management permissions from the Super Admin role');
      }
    }

    role.permissions = entries;
  }

  await role.save();
  return getRole(role._id);
}

