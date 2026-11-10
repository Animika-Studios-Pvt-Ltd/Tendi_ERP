import { Router } from 'express';
import { MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './roles.controller.js';
import { roleIdParams, updateRoleSchema } from './roles.validator.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize(MODULES.USERS, 'read'), controller.list);
router.get('/:id', authorize(MODULES.USERS, 'read'), validate({ params: roleIdParams }), controller.get);
router.patch(
  '/:id',
  authorize(MODULES.USERS, 'update'),
  validate({ params: roleIdParams, body: updateRoleSchema }),
  controller.update,
);

export default router;

