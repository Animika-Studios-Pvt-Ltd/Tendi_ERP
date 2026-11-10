import { Router } from 'express';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './sites.controller.js';
import {
  createDprSchema,
  createSiteSchema,
  dprIdParams,
  listDprQuery,
  listSitesQuery,
  siteIdParams,
  transitionDprSchema,
  updateDprSchema,
  updateSiteSchema,
} from './sites.validator.js';

const { CREATE, READ, UPDATE, DELETE, APPROVE, REJECT } = ACTIONS;
const can = (action) => authorize(MODULES.SITES, action);

const router = Router();
router.use(authenticate);

/* Daily Progress Reports (mounted before /:id) */
router.get('/dpr', can(READ), validate({ query: listDprQuery }), controller.listDprs);
router.post('/dpr', can(CREATE), validate({ body: createDprSchema }), controller.createDpr);
router.get('/dpr/:id', can(READ), validate({ params: dprIdParams }), controller.getDpr);
router.patch('/dpr/:id', can(UPDATE), validate({ params: dprIdParams, body: updateDprSchema }), controller.updateDpr);
router.post(
  '/dpr/:id/transition',
  authorize(MODULES.SITES, APPROVE, REJECT, UPDATE, CREATE),
  validate({ params: dprIdParams, body: transitionDprSchema }),
  controller.transitionDpr,
);

/* Sites CRUD */
router.get('/', can(READ), validate({ query: listSitesQuery }), controller.listSites);
router.post('/', can(CREATE), validate({ body: createSiteSchema }), controller.createSite);
router.get('/:id', can(READ), validate({ params: siteIdParams }), controller.getSite);
router.patch('/:id', can(UPDATE), validate({ params: siteIdParams, body: updateSiteSchema }), controller.updateSite);
router.delete('/:id', can(DELETE), validate({ params: siteIdParams }), controller.deleteSite);

export default router;

