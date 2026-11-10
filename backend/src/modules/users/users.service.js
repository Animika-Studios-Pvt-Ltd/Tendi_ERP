import { ROLES } from '../../config/rbac.js';
import { Project } from '../../models/Project.js';
import { Role } from '../../models/Role.js';
import { User, USER_STATUS } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { paginate, parsePagination } from '../../utils/pagination.js';

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toUserDto(user) {
  const role = user.role;
  return {
    id: String(user._id),
    firstName: user.firstName,
    lastName: user.lastName ?? '',
    fullName: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' '),
    email: user.email,
    phone: user.phone ?? '',
    designation: user.designation ?? '',
    status: user.status,
    avatarUrl: user.avatar?.url ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
    assignedProjects: (user.assignedProjects ?? []).map((p) => {
      if (p && typeof p === 'object' && p._id) {
        return {
          id: String(p._id),
          code: p.code,
          name: p.name,
          status: p.status,
          contractValue: p.contractValue ?? 0,
          projectManager: p.projectManager
            ? {
                id: String(p.projectManager._id ?? p.projectManager),
                fullName:
                  p.projectManager.fullName ||
                  [p.projectManager.firstName, p.projectManager.lastName].filter(Boolean).join(' '),
              }
            : null,
        };
      }
      return String(p);
    }),
    role: role
      ? {
          id: String(role._id ?? role),
          key: role.key,
          name: role.name,
          dataScope: role.dataScope,
          permissions: typeof role.toPermissionMap === 'function'
            ? role.toPermissionMap()
            : role.permissions ?? {},
        }
      : null,
    permissionOverrides: (user.permissionOverrides ?? []).map((o) => ({
      module: o.module,
      action: o.action,
      granted: Boolean(o.granted),
    })),
    effectivePermissions: typeof user.toEffectivePermissionMap === 'function'
      ? user.toEffectivePermissionMap()
      : {},
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function countActiveSuperAdmins() {
  const superAdminRole = await Role.findOne({ key: ROLES.SUPER_ADMIN });
  if (!superAdminRole) return 0;
  return User.countDocuments({ role: superAdminRole._id, status: USER_STATUS.ACTIVE });
}

export async function resolveRole(roleIdentifier) {
  const isObjectId = /^[a-f\d]{24}$/i.test(roleIdentifier);
  const query = isObjectId ? { _id: roleIdentifier } : { key: roleIdentifier };
  const role = await Role.findOne(query);
  if (!role) {
    throw ApiError.badRequest('Selected role does not exist');
  }
  return role;
}

export async function listUsers(actor, query = {}) {
  const pagination = parsePagination(query, {
    allowedSortFields: ['firstName', 'lastName', 'email', 'status', 'createdAt', 'lastLoginAt'],
    defaultSort: '-createdAt',
  });

  const filter = {};

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.role) {
    if (/^[a-f\d]{24}$/i.test(query.role)) {
      filter.role = query.role;
    } else {
      const roleDoc = await Role.findOne({ key: query.role });
      if (roleDoc) {
        filter.role = roleDoc._id;
      } else {
        return { items: [], meta: { total: 0, page: pagination.page, limit: pagination.limit, totalPages: 1 } };
      }
    }
  }

  const { items, meta } = await paginate(User, filter, pagination, { populate: 'role' });
  return { items: items.map(toUserDto), meta };
}

export async function getUser(actor, userId) {
  const user = await User.findById(userId)
    .populate('role')
    .populate({
      path: 'assignedProjects',
      select: 'code name status contractValue projectManager',
      populate: { path: 'projectManager', select: 'firstName lastName email' },
    });
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return toUserDto(user);
}

export async function createUser(actor, data) {
  const email = data.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict('A user with this email address already exists');
  }

  const targetRole = await resolveRole(data.role);

  // Privilege escalation check: only a Super Admin can create a Super Admin
  if (targetRole.key === ROLES.SUPER_ADMIN && actor.role?.key !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only Super Admins can assign the Super Admin role');
  }

  // Permission overrides check: only Super Admin can set custom overrides
  let permissionOverrides = [];
  if (Array.isArray(data.permissionOverrides) && data.permissionOverrides.length > 0) {
    if (actor.role?.key !== ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Only Super Admins can configure individual permission overrides');
    }
    const map = new Map();
    for (const item of data.permissionOverrides) {
      map.set(`${item.module}:${item.action}`, {
        module: item.module,
        action: item.action,
        granted: Boolean(item.granted),
      });
    }
    permissionOverrides = Array.from(map.values());
  }

  const user = await User.create({
    firstName: data.firstName,
    lastName: data.lastName ?? '',
    email,
    password: data.password,
    phone: data.phone ?? '',
    designation: data.designation ?? '',
    role: targetRole._id,
    status: data.status ?? USER_STATUS.ACTIVE,
    assignedProjects: data.assignedProjects ?? [],
    permissionOverrides,
    createdBy: actor._id,
  });

  await user.populate('role');
  return user;
}

export async function updateUser(actor, userId, data) {
  const user = await User.findById(userId).populate('role');
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const isSelf = String(actor._id) === String(user._id);
  const targetIsSuperAdmin = user.role?.key === ROLES.SUPER_ADMIN;
  const actorIsSuperAdmin = actor.role?.key === ROLES.SUPER_ADMIN;

  // Company Admins cannot modify Super Admin accounts
  if (targetIsSuperAdmin && !actorIsSuperAdmin) {
    throw ApiError.forbidden('Company Admins cannot modify Super Admin accounts');
  }

  // Self-protection: Users cannot change their own role or deactivate themselves
  if (isSelf && data.role !== undefined && String(data.role) !== String(user.role._id) && data.role !== user.role.key) {
    throw ApiError.badRequest('You cannot change your own role');
  }
  if (isSelf && data.status !== undefined && data.status !== USER_STATUS.ACTIVE && user.status === USER_STATUS.ACTIVE) {
    throw ApiError.badRequest('You cannot deactivate or suspend your own account');
  }

  let newRoleDoc = null;
  if (data.role !== undefined) {
    newRoleDoc = await resolveRole(data.role);

    // Only Super Admins can grant the Super Admin role
    if (newRoleDoc.key === ROLES.SUPER_ADMIN && !actorIsSuperAdmin) {
      throw ApiError.forbidden('Only Super Admins can assign the Super Admin role');
    }

    // Protect the last active Super Admin against demotion
    if (targetIsSuperAdmin && newRoleDoc.key !== ROLES.SUPER_ADMIN && user.status === USER_STATUS.ACTIVE) {
      const activeSuperCount = await countActiveSuperAdmins();
      if (activeSuperCount <= 1) {
        throw ApiError.badRequest('Cannot change the role of the last active Super Admin');
      }
    }
  }

  // Protect the last active Super Admin against deactivation or suspension
  if (data.status !== undefined && data.status !== USER_STATUS.ACTIVE && targetIsSuperAdmin && user.status === USER_STATUS.ACTIVE) {
    const activeSuperCount = await countActiveSuperAdmins();
    if (activeSuperCount <= 1) {
      throw ApiError.badRequest('Cannot deactivate or suspend the last active Super Admin');
    }
  }

  // Check email uniqueness if changing email
  if (data.email !== undefined && data.email.toLowerCase() !== user.email) {
    const email = data.email.toLowerCase();
    const duplicate = await User.findOne({ email, _id: { $ne: user._id } });
    if (duplicate) {
      throw ApiError.conflict('A user with this email address already exists');
    }
    user.email = email;
  }

  if (data.firstName !== undefined) user.firstName = data.firstName;
  if (data.lastName !== undefined) user.lastName = data.lastName;
  if (data.phone !== undefined) user.phone = data.phone;
  if (data.designation !== undefined) user.designation = data.designation;
  if (newRoleDoc) user.role = newRoleDoc._id;
  if (data.status !== undefined) user.status = data.status;
  if (data.assignedProjects !== undefined) user.assignedProjects = data.assignedProjects;
  if (data.password) user.password = data.password;

  if (data.permissionOverrides !== undefined) {
    if (actor.role?.key !== ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Only Super Admins can configure individual permission overrides');
    }
    const map = new Map();
    for (const item of data.permissionOverrides) {
      map.set(`${item.module}:${item.action}`, {
        module: item.module,
        action: item.action,
        granted: Boolean(item.granted),
      });
    }
    user.permissionOverrides = Array.from(map.values());
  }

  user.updatedBy = actor._id;
  await user.save();
  await user.populate('role');
  return user;
}

export async function setUserStatus(actor, userId, status) {
  return updateUser(actor, userId, { status });
}

export async function setUserPermissions(actor, userId, permissionOverrides) {
  return updateUser(actor, userId, { permissionOverrides });
}

export async function assignProjectsToUser(actor, userId, payload) {
  const user = await User.findById(userId).populate('role');
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const isSuperAdmin = user.role?.key === ROLES.SUPER_ADMIN;
  const actorIsSuperAdmin = actor.role?.key === ROLES.SUPER_ADMIN;
  if (isSuperAdmin && !actorIsSuperAdmin) {
    throw ApiError.forbidden('Company Admins cannot modify Super Admin accounts');
  }

  const rawIds = payload.projectIds ? payload.projectIds : payload.projectId ? [payload.projectId] : [];
  const targetIds = [...new Set(rawIds.map(String))];

  if (!targetIds.length) {
    throw ApiError.badRequest('Select at least one project to assign');
  }

  // Verify all target projects exist
  const existingProjects = await Project.find({ _id: { $in: targetIds } }).select('_id');
  if (existingProjects.length !== targetIds.length) {
    throw ApiError.validation([{ field: 'projectId', message: 'One or more selected projects do not exist' }]);
  }

  // Check duplicate assignments
  const currentAssigned = new Set((user.assignedProjects || []).map(String));
  const newAssignments = targetIds.filter((id) => !currentAssigned.has(id));

  if (targetIds.length === 1 && currentAssigned.has(targetIds[0])) {
    throw ApiError.badRequest('Employee is already assigned to this project');
  }

  if (newAssignments.length === 0) {
    throw ApiError.badRequest('Employee is already assigned to all selected projects');
  }

  user.assignedProjects.push(...newAssignments);
  user.updatedBy = actor._id;
  await user.save();
  return getUser(actor, user._id);
}

export async function removeProjectFromUser(actor, userId, projectId) {
  const user = await User.findById(userId).populate('role');
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const isSuperAdmin = user.role?.key === ROLES.SUPER_ADMIN;
  const actorIsSuperAdmin = actor.role?.key === ROLES.SUPER_ADMIN;
  if (isSuperAdmin && !actorIsSuperAdmin) {
    throw ApiError.forbidden('Company Admins cannot modify Super Admin accounts');
  }

  // Protect designated Project Manager against removal without reassignment
  const project = await Project.findById(projectId).select('projectManager code');
  if (project?.projectManager && String(project.projectManager) === String(user._id)) {
    throw ApiError.badRequest(
      'This employee is the designated Project Manager for this project. Reassign the project manager before removing.',
    );
  }

  const result = await User.updateOne(
    { _id: user._id, assignedProjects: projectId },
    { $pull: { assignedProjects: projectId } },
  );

  if (result.matchedCount === 0) {
    throw ApiError.notFound('This project is not assigned to this employee');
  }

  return getUser(actor, user._id);
}

export async function listAvailableProjectsForUser(actor, userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const assignedSet = new Set((user.assignedProjects || []).map(String));
  const projects = await Project.find({ status: { $ne: 'cancelled' } })
    .select('code name status contractValue projectManager')
    .populate('projectManager', 'firstName lastName')
    .sort({ name: 1 })
    .lean();

  return projects
    .filter((p) => !assignedSet.has(String(p._id)))
    .map((p) => ({
      id: String(p._id),
      code: p.code,
      name: p.name,
      status: p.status,
      contractValue: p.contractValue ?? 0,
      projectManager: p.projectManager
        ? {
            id: String(p.projectManager._id),
            fullName: [p.projectManager.firstName, p.projectManager.lastName].filter(Boolean).join(' '),
          }
        : null,
    }));
}

