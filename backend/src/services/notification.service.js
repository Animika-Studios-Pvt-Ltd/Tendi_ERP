import { ROLES } from '../config/rbac.js';
import { Notification, NOTIFICATION_TYPES } from '../models/Notification.js';
import { Role } from '../models/Role.js';
import { User, USER_STATUS } from '../models/User.js';
import { logger } from '../utils/logger.js';

/**
 * Emits in-app notifications without throwing or blocking caller transactions.
 */
export async function notifyUsers(recipientIds, payload) {
  const uniqueIds = [...new Set((recipientIds || []).filter(Boolean).map(String))];
  if (!uniqueIds.length) return [];

  try {
    const docs = uniqueIds.map((recipient) => ({
      recipient,
      type: payload.type ?? NOTIFICATION_TYPES.INFO,
      title: payload.title,
      message: payload.message ?? '',
      module: payload.module,
      entityType: payload.entityType,
      entityId: payload.entityId,
      project: payload.project,
      link: payload.link ?? '',
      createdBy: payload.createdBy,
    }));
    return await Notification.insertMany(docs, { ordered: false });
  } catch (error) {
    logger.warn('Notification dispatch failed:', error.message);
    return [];
  }
}

/**
 * Finds active approvers (Project Managers / Company Admins assigned to the project,
 * or users with `approve` permission in the module) and notifies them.
 */
export async function notifyProjectApprovers({
  projectId,
  module,
  excludeUserId,
  title,
  message,
  entityType,
  entityId,
  link,
  createdBy,
}) {
  try {
    const roles = await Role.find({ isActive: true }).lean();
    const approverRoleIds = roles
      .filter(
        (r) =>
          [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN].includes(r.key) ||
          (r.permissions || []).some((p) => p.module === module && p.actions?.includes('approve')),
      )
      .map((r) => r._id);

    const adminRoleIds = roles
      .filter((r) => [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN].includes(r.key))
      .map((r) => r._id);

    const candidates = await User.find({
      status: USER_STATUS.ACTIVE,
      role: { $in: approverRoleIds },
      $or: [
        { role: { $in: adminRoleIds } },
        ...(projectId ? [{ assignedProjects: projectId }] : []),
      ],
    })
      .select('_id')
      .lean();

    const recipientIds = candidates
      .map((u) => String(u._id))
      .filter((id) => !excludeUserId || id !== String(excludeUserId));

    return await notifyUsers(recipientIds, {
      type: NOTIFICATION_TYPES.APPROVAL_REQUIRED,
      title,
      message,
      module,
      entityType,
      entityId,
      project: projectId,
      link,
      createdBy,
    });
  } catch (error) {
    logger.warn('notifyProjectApprovers failed:', error.message);
    return [];
  }
}

