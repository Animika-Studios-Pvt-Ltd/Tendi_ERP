import { z } from 'zod';
import { ACTION_LIST, MODULE_LIST } from '../../config/rbac.js';

export const roleIdParams = z.object({
  id: z.string().min(1, 'Role ID or key is required'),
});

const permissionEntrySchema = z.object({
  module: z.enum(MODULE_LIST),
  actions: z.array(z.enum(ACTION_LIST)),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  permissions: z.union([
    z.array(permissionEntrySchema),
    z.record(z.enum(MODULE_LIST), z.array(z.enum(ACTION_LIST))),
  ]).optional(),
});

