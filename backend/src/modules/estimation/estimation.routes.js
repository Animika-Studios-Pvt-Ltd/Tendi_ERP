import { Router } from 'express';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './estimation.controller.js';
import {
  awardTenderSchema,
  convertEstimateSchema,
  createBidSchema,
  createBoqItemSchema,
  createEstimateSchema,
  createRateAnalysisSchema,
  createTenderSchema,
  estimateBoqParams,
  idParams,
  listEstimatesQuery,
  listRateAnalysesQuery,
  listTendersQuery,
  reviseEstimateSchema,
  transitionEstimateSchema,
  updateBoqItemSchema,
  updateEstimateSchema,
  updateRateAnalysisSchema,
  updateTenderSchema,
} from './estimation.validator.js';

const { CREATE, READ, UPDATE, DELETE, APPROVE, REJECT } = ACTIONS;
const can = (action) => authorize(MODULES.ESTIMATION, action);

const router = Router();
router.use(authenticate);

/* Rate Analyses */
router.get('/rate-analyses', can(READ), validate({ query: listRateAnalysesQuery }), controller.listRateAnalyses);
router.post('/rate-analyses', can(CREATE), validate({ body: createRateAnalysisSchema }), controller.createRateAnalysis);
router.patch('/rate-analyses/:id', can(UPDATE), validate({ params: idParams, body: updateRateAnalysisSchema }), controller.updateRateAnalysis);
router.delete('/rate-analyses/:id', can(DELETE), validate({ params: idParams }), controller.deleteRateAnalysis);

/* Tenders & Bids */
router.get('/tenders', can(READ), validate({ query: listTendersQuery }), controller.listTenders);
router.post('/tenders', can(CREATE), validate({ body: createTenderSchema }), controller.createTender);
router.get('/tenders/:id', can(READ), validate({ params: idParams }), controller.getTender);
router.patch('/tenders/:id', can(UPDATE), validate({ params: idParams, body: updateTenderSchema }), controller.updateTender);
router.post('/tenders/:id/bids', can(UPDATE), validate({ params: idParams, body: createBidSchema }), controller.addBid);
router.post('/tenders/:id/award', can(APPROVE), validate({ params: idParams, body: awardTenderSchema }), controller.awardTender);

/* Estimates & BOQ */
router.get('/estimates', can(READ), validate({ query: listEstimatesQuery }), controller.listEstimates);
router.post('/estimates', can(CREATE), validate({ body: createEstimateSchema }), controller.createEstimate);
router.get('/estimates/:id', can(READ), validate({ params: idParams }), controller.getEstimate);
router.patch('/estimates/:id', can(UPDATE), validate({ params: idParams, body: updateEstimateSchema }), controller.updateEstimate);
router.post('/estimates/:id/revise', can(CREATE), validate({ params: idParams, body: reviseEstimateSchema }), controller.reviseEstimate);
router.post(
  '/estimates/:id/transition',
  authorize(MODULES.ESTIMATION, CREATE, UPDATE, APPROVE, REJECT),
  validate({ params: idParams, body: transitionEstimateSchema }),
  controller.transitionEstimate,
);
router.post('/estimates/:id/convert-to-project', can(APPROVE), validate({ params: idParams, body: convertEstimateSchema }), controller.convertToProject);
router.get('/estimates/:id/budget-analysis', can(READ), validate({ params: idParams }), controller.getBudgetAnalysis);

router.post('/estimates/:id/boq-items', can(UPDATE), validate({ params: idParams, body: createBoqItemSchema }), controller.addBoqItem);
router.patch('/estimates/:id/boq-items/:itemId', can(UPDATE), validate({ params: estimateBoqParams, body: updateBoqItemSchema }), controller.updateBoqItem);
router.delete('/estimates/:id/boq-items/:itemId', can(UPDATE), validate({ params: estimateBoqParams }), controller.deleteBoqItem);

export default router;

