import { z } from 'zod';
import { ACTION_LIST, MODULE_LIST } from '../../config/rbac.js';
import { USER_STATUS } from '../../models/User.js';

const objectIdRegex = /^[a-f\d]{24}$/i;

export const listUsersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  role: z.string().trim().optional(),
  status: z.enum(Object.values(USER_STATUS)).optional(),
  sort: z.string().trim().optional(),
});

export const userIdParams = z.object({
  id: z.string().regex(objectIdRegex, 'Invalid user ID format'),
});

export const permissionOverrideItemSchema = z.object({
  module: z.enum(MODULE_LIST, { errorMap: () => ({ message: 'Invalid module name' }) }),
  action: z.enum(ACTION_LIST, { errorMap: () => ({ message: 'Invalid action name' }) }),
  granted: z.boolean({ required_error: 'granted must be a boolean' }),
});

export const updatePermissionsSchema = z.object({
  permissionOverrides: z.array(permissionOverrideItemSchema),
});

export const createUserSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().max(60).optional().default(''),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  phone: z.string().trim().max(20).optional().default(''),
  designation: z.string().trim().max(80).optional().default(''),
  role: z.string().min(1, 'Role is required'),
  status: z.enum(Object.values(USER_STATUS)).default(USER_STATUS.ACTIVE),
  assignedProjects: z.array(z.string().regex(objectIdRegex, 'Invalid project ID')).optional().default([]),
  permissionOverrides: z.array(permissionOverrideItemSchema).optional().default([]),
});

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1, 'First name cannot be empty').max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
  phone: z.string().trim().max(20).optional(),
  designation: z.string().trim().max(80).optional(),
  role: z.string().min(1).optional(),
  status: z.enum(Object.values(USER_STATUS)).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters long').optional(),
  assignedProjects: z.array(z.string().regex(objectIdRegex, 'Invalid project ID')).optional(),
  permissionOverrides: z.array(permissionOverrideItemSchema).optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(Object.values(USER_STATUS), {
    errorMap: () => ({ message: 'Status must be active, inactive or suspended' }),
  }),
});

export const assignProjectsSchema = z
  .object({
    projectId: z.string().regex(objectIdRegex, 'Invalid project ID format').optional(),
    projectIds: z.array(z.string().regex(objectIdRegex, 'Invalid project ID format')).optional(),
  })
  .refine((data) => Boolean(data.projectId || (data.projectIds && data.projectIds.length > 0)), {
    message: 'Provide projectId or projectIds',
  });

export const userProjectParams = z.object({
  id: z.string().regex(objectIdRegex, 'Invalid user ID format'),
  projectId: z.string().regex(objectIdRegex, 'Invalid project ID format'),
});

