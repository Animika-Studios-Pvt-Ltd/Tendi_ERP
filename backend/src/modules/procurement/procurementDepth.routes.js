import { Router } from 'express';
import { z } from 'zod';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { GoodsReceipt } from '../../models/GoodsReceipt.js';
import { TRANSACTION_TYPES } from '../../models/InventoryTransaction.js';
import { Material } from '../../models/Material.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { Project } from '../../models/Project.js';
import { PurchaseOrder } from '../../models/PurchaseOrder.js';
import { PurchaseReturn, Rfq } from '../../models/Rfq.js';
import { Vendor } from '../../models/Vendor.js';
import { recordAudit } from '../../services/audit.service.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';
import { recordTransaction } from '../inventory/inventory.service.js';

const { CREATE, READ, UPDATE, APPROVE } = ACTIONS;
const can = (action) => authorize(MODULES.PROCUREMENT, action);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');
const nullableId = z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null);
const text = (max) => z.string().trim().max(max);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const createRfqSchema = z.object({
  title: z.string().trim().min(2).max(180),
  project: objectId,
  materialRequest: nullableId.optional(),
  vendors: z.array(objectId).min(1, 'Select at least one vendor'),
  dueDate: z.string().optional(),
  items: z
    .array(
      z.object({
        material: objectId,
        quantity: z.coerce.number().positive(),
        unit: z.string().trim().min(1).max(30),
        notes: text(200).optional().default(''),
      }),
    )
    .min(1),
});

const addQuoteSchema = z.object({
  vendor: objectId,
  deliveryDays: z.coerce.number().int().min(1).optional().default(7),
  validityDays: z.coerce.number().int().min(1).optional().default(30),
  remarks: text(500).optional().default(''),
  items: z
    .array(
      z.object({
        material: objectId,
        unitRate: z.coerce.number().min(0),
        taxPercent: z.coerce.number().min(0).max(100).optional().default(18),
      }),
    )
    .min(1),
});

const awardRfqSchema = z.object({
  vendor: objectId,
  termsAndConditions: text(1000).optional().default(''),
});

const createReturnSchema = z.object({
  purchaseOrder: objectId,
  goodsReceipt: nullableId.optional(),
  site: nullableId.optional(),
  reason: text(500).optional().default('Quality rejection / damaged goods'),
  items: z
    .array(
      z.object({
        material: objectId,
        returnedQuantity: z.coerce.number().positive(),
        unit: text(30).optional().default('nos'),
        unitRate: z.coerce.number().min(0).optional(),
        reason: text(300).optional().default(''),
      }),
    )
    .min(1),
});

const router = Router();

/* =========================================================================
 * RFQs & VENDOR QUOTATION COMPARISON
 * ========================================================================= */
router.get('/rfqs', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const rows = await Rfq.find(scope)
    .populate('project', 'code name')
    .populate('vendors', 'code name')
    .populate('quotations.vendor', 'code name')
    .populate('items.material', 'code name unit')
    .populate('generatedPo', 'poNumber status')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, rows.map((r) => ({ id: String(r._id), ...r })));
});

router.post('/rfqs', can(CREATE), validate({ body: createRfqSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const rfqNumber = await nextSequenceNumber('rfq', { prefixOverride: 'RFQ', minPadding: 3 });
  const rfq = await Rfq.create({
    ...req.body,
    rfqNumber,
    dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await rfq.populate('project vendors quotations.vendor items.material');
  sendSuccess(res, { id: String(rfq._id), ...rfq.toObject() }, { status: 201, message: 'RFQ floated to vendors' });
});

router.post('/rfqs/:id/quotations', can(UPDATE), validate({ params: z.object({ id: objectId }), body: addQuoteSchema }), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const rfq = await Rfq.findOne({ $and: [scope, { _id: req.validated.params.id }] });
  if (!rfq) throw ApiError.notFound('RFQ not found');
  if (rfq.status === 'awarded') throw ApiError.badRequest('RFQ is already awarded');

  const qtyByMat = new Map(rfq.items.map((i) => [String(i.material), i.quantity]));
  let quotedTotal = 0;
  const items = req.body.items.map((q) => {
    const qty = qtyByMat.get(String(q.material)) ?? 0;
    const base = qty * q.unitRate;
    const lineTotal = round2(base + (base * (q.taxPercent ?? 18)) / 100);
    quotedTotal += lineTotal;
    return { material: q.material, unitRate: q.unitRate, taxPercent: q.taxPercent, lineTotal };
  });

  rfq.quotations = rfq.quotations.filter((q) => String(q.vendor) !== String(req.body.vendor));
  rfq.quotations.push({
    vendor: req.body.vendor,
    items,
    quotedTotal: round2(quotedTotal),
    deliveryDays: req.body.deliveryDays,
    validityDays: req.body.validityDays,
    remarks: req.body.remarks,
  });
  rfq.status = 'evaluation';
  rfq.updatedBy = req.user._id;
  await rfq.save();
  await rfq.populate('project vendors quotations.vendor items.material');
  sendSuccess(res, { id: String(rfq._id), ...rfq.toObject() }, { status: 201, message: 'Vendor quotation logged' });
});

router.get('/rfqs/:id/comparison', can(READ), validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const rfq = await Rfq.findOne({ $and: [scope, { _id: req.validated.params.id }] })
    .populate('quotations.vendor', 'code name')
    .populate('items.material', 'code name unit')
    .lean();
  if (!rfq) throw ApiError.notFound('RFQ not found');
  const sorted = [...(rfq.quotations ?? [])].sort((a, b) => a.quotedTotal - b.quotedTotal);
  sendSuccess(res, { rfqId: String(rfq._id), rfqNumber: rfq.rfqNumber, title: rfq.title, items: rfq.items, rankedQuotations: sorted });
});

router.post('/rfqs/:id/award', can(APPROVE), validate({ params: z.object({ id: objectId }), body: awardRfqSchema }), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const rfq = await Rfq.findOne({ $and: [scope, { _id: req.validated.params.id }] });
  if (!rfq) throw ApiError.notFound('RFQ not found');
  if (rfq.status === 'awarded') throw ApiError.badRequest('RFQ is already awarded');

  const winningQuote = rfq.quotations.find((q) => String(q.vendor) === String(req.body.vendor));
  if (!winningQuote) throw ApiError.badRequest('Selected vendor has not submitted a quotation on this RFQ');

  const project = await Project.findById(rfq.project).lean();
  const quoteByMat = new Map(winningQuote.items.map((i) => [String(i.material), i]));

  let subtotal = 0;
  let taxTotal = 0;
  const poItems = rfq.items.map((rfqItem) => {
    const q = quoteByMat.get(String(rfqItem.material));
    const unitRate = q?.unitRate ?? 0;
    const taxPercent = q?.taxPercent ?? 18;
    const base = rfqItem.quantity * unitRate;
    const tax = round2((base * taxPercent) / 100);
    subtotal += base;
    taxTotal += tax;
    return {
      material: rfqItem.material,
      quantity: rfqItem.quantity,
      unit: rfqItem.unit,
      unitRate,
      taxPercent,
      lineTotal: round2(base + tax),
    };
  });

  const poNumber = await nextSequenceNumber('purchaseOrder', {
    scopeKey: String(rfq.project),
    contextCode: project?.code,
  });

  const po = await PurchaseOrder.create({
    poNumber,
    project: rfq.project,
    vendor: winningQuote.vendor,
    materialRequest: rfq.materialRequest || undefined,
    rfqRef: rfq._id,
    items: poItems,
    subtotal: round2(subtotal),
    taxTotal: round2(taxTotal),
    grandTotal: round2(subtotal + taxTotal),
    termsAndConditions: req.body.termsAndConditions,
    status: APPROVAL_STATUS.DRAFT,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  for (const q of rfq.quotations) {
    q.isAwarded = String(q.vendor) === String(req.body.vendor);
  }
  rfq.status = 'awarded';
  rfq.awardedVendor = winningQuote.vendor;
  rfq.generatedPo = po._id;
  rfq.updatedBy = req.user._id;
  await rfq.save();

  recordAudit(req, { action: 'rfq.award', module: MODULES.PROCUREMENT, entityType: 'Rfq', entityId: rfq._id, project: rfq.project, summary: `Awarded ${rfq.rfqNumber} -> drafted ${po.poNumber}` });
  sendSuccess(res, { rfqId: String(rfq._id), poId: String(po._id), poNumber: po.poNumber }, { status: 201, message: `Awarded RFQ and drafted ${po.poNumber}` });
});

/* =========================================================================
 * PURCHASE RETURNS & DEBIT NOTES
 * ========================================================================= */
router.get('/returns', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const rows = await PurchaseReturn.find(scope)
    .populate('project', 'code name')
    .populate('vendor', 'code name')
    .populate('purchaseOrder', 'poNumber')
    .populate('items.material', 'code name unit')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, rows.map((r) => ({ id: String(r._id), ...r })));
});

router.post('/returns', can(CREATE), validate({ body: createReturnSchema }), async (req, res) => {
  const po = await PurchaseOrder.findById(req.body.purchaseOrder).lean();
  if (!po || !canAccessProject(req.user, po.project)) throw ApiError.notFound('Purchase order not found');

  let totalAmount = 0;
  const lines = [];
  for (const item of req.body.items) {
    const mat = await Material.findById(item.material).lean();
    if (!mat) throw ApiError.validation([{ field: 'items', message: 'Material not found' }]);
    const poItem = po.items.find((p) => String(p.material) === String(item.material));
    const unitRate = item.unitRate ?? poItem?.unitRate ?? mat.standardRate ?? 0;
    const lineTotal = round2(item.returnedQuantity * unitRate);
    totalAmount += lineTotal;
    lines.push({
      material: mat._id,
      returnedQuantity: item.returnedQuantity,
      unit: item.unit || mat.unit,
      unitRate,
      lineTotal,
      reason: item.reason || req.body.reason,
    });
  }

  const returnNumber = await nextSequenceNumber('purchaseReturn', { prefixOverride: 'PRN', minPadding: 3 });
  const pr = await PurchaseReturn.create({
    returnNumber,
    project: po.project,
    site: req.body.site || null,
    purchaseOrder: po._id,
    goodsReceipt: req.body.goodsReceipt || null,
    vendor: po.vendor,
    reason: req.body.reason,
    items: lines,
    totalAmount: round2(totalAmount),
    createdBy: req.user._id,
  });

  // Deduct stock via adjustment (PurchaseReturn)
  for (const l of lines) {
    await recordTransaction(
      req.user,
      {
        project: String(po.project),
        site: req.body.site || undefined,
        material: String(l.material),
        type: TRANSACTION_TYPES.ADJUSTMENT,
        quantity: l.returnedQuantity,
        direction: 'decrease',
        unitRate: l.unitRate,
        referenceType: 'PurchaseReturn',
        referenceId: pr._id,
        referenceNumber: pr.returnNumber,
        remarks: `Purchase return (${pr.returnNumber}): ${l.reason}`,
      },
      { bypassAccessCheck: true },
    );
  }

  sendSuccess(res, { id: String(pr._id), ...pr.toObject() }, { status: 201, message: `Purchase return ${returnNumber} recorded` });
});

/* =========================================================================
 * VENDOR PERFORMANCE SCORECARD
 * ========================================================================= */
router.get('/vendors/:id/performance', can(READ), validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const vendor = await Vendor.findById(req.validated.params.id).lean();
  if (!vendor) throw ApiError.notFound('Vendor not found');

  const [pos, grns, returns] = await Promise.all([
    PurchaseOrder.find({ vendor: vendor._id }).select('grandTotal status expectedDeliveryDate poDate').lean(),
    GoodsReceipt.find({ vendor: vendor._id }).populate('purchaseOrder', 'expectedDeliveryDate').select('receivedDate purchaseOrder').lean(),
    PurchaseReturn.find({ vendor: vendor._id }).select('totalAmount').lean(),
  ]);

  const totalSpend = round2(pos.reduce((s, p) => s + (p.grandTotal || 0), 0));
  const evaluatedGrns = grns.filter((g) => g.purchaseOrder?.expectedDeliveryDate);
  const onTimeCount = evaluatedGrns.filter((g) => new Date(g.receivedDate) <= new Date(g.purchaseOrder.expectedDeliveryDate)).length;
  const onTimePercent = evaluatedGrns.length > 0 ? Math.round((onTimeCount / evaluatedGrns.length) * 100) : 100;
  const returnedValue = round2(returns.reduce((s, r) => s + (r.totalAmount || 0), 0));

  sendSuccess(res, {
    vendorId: String(vendor._id),
    code: vendor.code,
    name: vendor.name,
    poCount: pos.length,
    grnCount: grns.length,
    returnCount: returns.length,
    totalSpend,
    returnedValue,
    onTimePercent,
  });
});

export default router;

