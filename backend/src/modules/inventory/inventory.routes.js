import { Router } from 'express';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './inventory.controller.js';
import inventoryDepthRoutes from './inventoryDepth.routes.js';
import {
  createMaterialSchema,
  createTransactionSchema,
  listMaterialsQuery,
  listStockQuery,
  listTransactionsQuery,
  materialIdParams,
  transferStockSchema,
  updateMaterialSchema,
} from './inventory.validator.js';

const { CREATE, READ, UPDATE, DELETE } = ACTIONS;
const can = (action) => authorize(MODULES.INVENTORY, action);

const router = Router();
router.use(authenticate);
router.use('/', inventoryDepthRoutes);

/* Stock Overview & Transactions */
router.get('/stock', can(READ), validate({ query: listStockQuery }), controller.getStockOverview);
router.get('/transactions', can(READ), validate({ query: listTransactionsQuery }), controller.listTransactions);
router.post('/transactions', can(CREATE), validate({ body: createTransactionSchema }), controller.recordTransaction);
router.post('/transfers', can(CREATE), validate({ body: transferStockSchema }), controller.transferStock);

/* Material Master */
router.get('/materials', can(READ), validate({ query: listMaterialsQuery }), controller.listMaterials);
router.post('/materials', can(CREATE), validate({ body: createMaterialSchema }), controller.createMaterial);
router.get('/materials/:id', can(READ), validate({ params: materialIdParams }), controller.getMaterial);
router.patch('/materials/:id', can(UPDATE), validate({ params: materialIdParams, body: updateMaterialSchema }), controller.updateMaterial);
router.delete('/materials/:id', can(DELETE), validate({ params: materialIdParams }), controller.deleteMaterial);

export default router;

