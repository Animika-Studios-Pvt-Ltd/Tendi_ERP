import { Router } from 'express';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './procurement.controller.js';
import {
  createGrnSchema,
  createMrSchema,
  createPoSchema,
  createVendorSchema,
  idParams,
  listGrnQuery,
  listMrQuery,
  listPoQuery,
  listVendorsQuery,
  transitionSchema,
  updateMrSchema,
  updatePoSchema,
  updateVendorSchema,
} from './procurement.validator.js';

const { CREATE, READ, UPDATE, DELETE, APPROVE, REJECT } = ACTIONS;
const can = (action) => authorize(MODULES.PROCUREMENT, action);

const router = Router();
router.use(authenticate);

/* Vendors */
router.get('/vendors', can(READ), validate({ query: listVendorsQuery }), controller.listVendors);
router.post('/vendors', can(CREATE), validate({ body: createVendorSchema }), controller.createVendor);
router.get('/vendors/:id', can(READ), validate({ params: idParams }), controller.getVendor);
router.patch('/vendors/:id', can(UPDATE), validate({ params: idParams, body: updateVendorSchema }), controller.updateVendor);
router.delete('/vendors/:id', can(DELETE), validate({ params: idParams }), controller.deleteVendor);

/* Material Requests */
router.get('/requests', can(READ), validate({ query: listMrQuery }), controller.listMrs);
router.post('/requests', can(CREATE), validate({ body: createMrSchema }), controller.createMr);
router.get('/requests/:id', can(READ), validate({ params: idParams }), controller.getMr);
router.patch('/requests/:id', can(UPDATE), validate({ params: idParams, body: updateMrSchema }), controller.updateMr);
router.post(
  '/requests/:id/transition',
  authorize(MODULES.PROCUREMENT, APPROVE, REJECT, UPDATE, CREATE),
  validate({ params: idParams, body: transitionSchema }),
  controller.transitionMr,
);

/* Purchase Orders */
router.get('/purchase-orders', can(READ), validate({ query: listPoQuery }), controller.listPos);
router.post('/purchase-orders', can(CREATE), validate({ body: createPoSchema }), controller.createPo);
router.get('/purchase-orders/:id', can(READ), validate({ params: idParams }), controller.getPo);
router.patch('/purchase-orders/:id', can(UPDATE), validate({ params: idParams, body: updatePoSchema }), controller.updatePo);
router.post(
  '/purchase-orders/:id/transition',
  authorize(MODULES.PROCUREMENT, APPROVE, REJECT, UPDATE, CREATE),
  validate({ params: idParams, body: transitionSchema }),
  controller.transitionPo,
);

/* Goods Receipts (GRN) */
router.get('/goods-receipts', can(READ), validate({ query: listGrnQuery }), controller.listGrns);
router.post('/goods-receipts', can(CREATE), validate({ body: createGrnSchema }), controller.createGrn);
router.get('/goods-receipts/:id', can(READ), validate({ params: idParams }), controller.getGrn);

export default router;

