import { Router } from 'express';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './settings.controller.js';
import { updateSettingsSchema } from './settings.validator.js';

const { READ, UPDATE } = ACTIONS;
const can = (action) => authorize(MODULES.SETTINGS, action);

const router = Router();
router.use(authenticate);

router.get('/master-data', controller.getMasterData);
router.get('/', can(READ), controller.get);
router.patch('/', can(UPDATE), validate({ body: updateSettingsSchema }), controller.update);

export default router;

