import { Router } from 'express';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './users.controller.js';
import {
  assignProjectsSchema,
  createUserSchema,
  listAuditLogsQuery,
  listUsersQuery,
  updatePermissionsSchema,
  updateStatusSchema,
  updateUserSchema,
  userIdParams,
  userProjectParams,
} from './users.validator.js';

const { CREATE, READ, UPDATE } = ACTIONS;
const can = (action) => authorize(MODULES.USERS, action);

const router = Router();
router.use(authenticate);

router.get('/audit-logs', can(READ), validate({ query: listAuditLogsQuery }), controller.listAuditLogs);
router.get('/', can(READ), validate({ query: listUsersQuery }), controller.list);
router.post('/', can(CREATE), validate({ body: createUserSchema }), controller.create);
router.get('/:id', can(READ), validate({ params: userIdParams }), controller.get);
router.patch('/:id', can(UPDATE), validate({ params: userIdParams, body: updateUserSchema }), controller.update);
router.patch('/:id/status', can(UPDATE), validate({ params: userIdParams, body: updateStatusSchema }), controller.setStatus);
router.patch('/:id/permissions', can(UPDATE), validate({ params: userIdParams, body: updatePermissionsSchema }), controller.setPermissions);

router.get('/:id/available-projects', can(READ), validate({ params: userIdParams }), controller.listAvailableProjects);
router.post('/:id/projects', can(UPDATE), validate({ params: userIdParams, body: assignProjectsSchema }), controller.assignProjects);
router.delete('/:id/projects/:projectId', can(UPDATE), validate({ params: userProjectParams }), controller.removeProject);

export default router;

