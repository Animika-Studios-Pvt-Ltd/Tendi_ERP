import { Router } from 'express';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { createUpload, FILE_TYPES } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './sites.controller.js';
import {
  createDprSchema,
  createInstructionSchema,
  createSiteSchema,
  dprIdParams,
  listDprQuery,
  listInstructionsQuery,
  listSitesQuery,
  siteIdParams,
  transitionDprSchema,
  updateDprSchema,
  updateInstructionSchema,
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
router.post(
  '/dpr/:id/photos',
  can(UPDATE),
  validate({ params: dprIdParams }),
  createUpload({ allowedTypes: FILE_TYPES.images, maxFiles: 5, required: true }).array('photos'),
  controller.uploadDprPhotos,
);
router.get('/dpr/:id/photos/:photoId/download', can(READ), validate({ params: dprIdParams }), controller.downloadDprPhoto);
router.post('/dpr/:id/post-consumption', can(APPROVE), validate({ params: dprIdParams }), controller.postDprConsumption);

/* Site Instructions */
router.get('/instructions', can(READ), validate({ query: listInstructionsQuery }), controller.listInstructions);
router.post('/instructions', can(CREATE), validate({ body: createInstructionSchema }), controller.createInstruction);
router.patch('/instructions/:id', can(UPDATE), validate({ params: siteIdParams, body: updateInstructionSchema }), controller.updateInstruction);

/* Sites CRUD */
router.get('/', can(READ), validate({ query: listSitesQuery }), controller.listSites);
router.post('/', can(CREATE), validate({ body: createSiteSchema }), controller.createSite);
router.get('/:id', can(READ), validate({ params: siteIdParams }), controller.getSite);
router.patch('/:id', can(UPDATE), validate({ params: siteIdParams, body: updateSiteSchema }), controller.updateSite);
router.delete('/:id', can(DELETE), validate({ params: siteIdParams }), controller.deleteSite);

export default router;

