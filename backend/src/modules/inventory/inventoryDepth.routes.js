import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { InventoryTransaction, TRANSACTION_TYPES } from '../../models/InventoryTransaction.js';
import { Material } from '../../models/Material.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { Project } from '../../models/Project.js';
import { Warehouse, StockVerification } from '../../models/Warehouse.js';
import { executeApprovalTransition } from '../../services/approval.service.js';
import { recordAudit } from '../../services/audit.service.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';
import { getCurrentStock, recordTransaction } from './inventory.service.js';

const { CREATE, READ, UPDATE, APPROVE, REJECT } = ACTIONS;
const can = (action) => authorize(MODULES.INVENTORY, action);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');
const nullableId = z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null);
const text = (max) => z.string().trim().max(max);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const createWarehouseSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(24),
  name: z.string().trim().min(2).max(120),
  type: z.enum(['central', 'site_store']).optional().default('site_store'),
  project: nullableId.optional(),
  site: nullableId.optional(),
  location: text(200).optional().default(''),
  storekeeper: nullableId.optional(),
});

const createVerificationSchema = z.object({
  project: objectId,
  site: nullableId.optional(),
  warehouse: nullableId.optional(),
  remarks: text(1000).optional().default(''),
  items: z
    .array(
      z.object({
        material: objectId,
        physicalQty: z.coerce.number().min(0),
        reason: text(300).optional().default(''),
      }),
    )
    .min(1),
});

const transitionSchema = z.object({
  status: z.enum(Object.values(APPROVAL_STATUS)),
  comment: text(500).optional().default(''),
});

const router = Router();

/* Barcode lookup (must precede /materials/:id) */
router.get('/materials/by-code/:barcode', can(READ), async (req, res) => {
  const code = String(req.params.barcode || '').trim().toUpperCase();
  if (!code) throw ApiError.notFound('Material not found');
  const mat = await Material.findOne({ $or: [{ barcode: code }, { code }] }).lean();
  if (!mat) throw ApiError.notFound('Material not found for barcode/code');
  sendSuccess(res, { id: String(mat._id), ...mat });
});

/* Warehouses */
router.get('/warehouses', can(READ), async (req, res) => {
  const projectScope = buildProjectScope(req.user, { projectField: 'project' });
  const filter = req.user.role?.dataScope === 'all' ? {} : { $or: [projectScope, { type: 'central', project: null }] };
  if (req.query.project) filter.project = req.query.project;
  const rows = await Warehouse.find(filter).populate('project', 'code name').populate('site', 'code name').sort({ code: 1 }).lean();
  sendSuccess(res, rows.map((w) => ({ id: String(w._id), ...w })));
});

router.post('/warehouses', can(CREATE), validate({ body: createWarehouseSchema }), async (req, res) => {
  if (req.body.project && !canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const exists = await Warehouse.findOne({ code: req.body.code });
  if (exists) throw ApiError.conflict('Warehouse code already exists');
  const wh = await Warehouse.create({ ...req.body, createdBy: req.user._id });
  sendSuccess(res, { id: String(wh._id), ...wh.toObject() }, { status: 201, message: 'Warehouse created' });
});

/* Weighted-Average Valuation */
router.get('/valuation', can(READ), async (req, res) => {
  const match = {};
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  if (scope.project?.$in) {
    match.project = { $in: scope.project.$in.map((id) => new mongoose.Types.ObjectId(id)) };
  }
  if (req.query.project) {
    if (!canAccessProject(req.user, req.query.project)) return sendSuccess(res, []);
    match.project = new mongoose.Types.ObjectId(req.query.project);
  }
  if (req.query.site && mongoose.isValidObjectId(req.query.site)) {
    match.site = new mongoose.Types.ObjectId(req.query.site);
  }

  const inflows = [TRANSACTION_TYPES.OPENING, TRANSACTION_TYPES.RECEIPT, TRANSACTION_TYPES.RETURN, TRANSACTION_TYPES.TRANSFER_IN];
  const rows = await InventoryTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: { project: '$project', material: '$material' },
        balance: { $sum: '$delta' },
        inflowQty: { $sum: { $cond: [{ $in: ['$type', inflows] }, '$quantity', 0] } },
        inflowValue: { $sum: { $cond: [{ $in: ['$type', inflows] }, '$totalValue', 0] } },
      },
    },
    { $lookup: { from: 'projects', localField: '_id.project', foreignField: '_id', as: 'proj' } },
    { $lookup: { from: 'materials', localField: '_id.material', foreignField: '_id', as: 'mat' } },
    { $unwind: '$proj' },
    { $unwind: '$mat' },
  ]);

  const result = rows.map((r) => {
    const weightedAvgRate = r.inflowQty > 0 ? round2(r.inflowValue / r.inflowQty) : (r.mat.standardRate ?? 0);
    return {
      project: { id: String(r.proj._id), code: r.proj.code, name: r.proj.name },
      material: { id: String(r.mat._id), code: r.mat.code, name: r.mat.name, unit: r.mat.unit, category: r.mat.category },
      currentStock: round2(r.balance),
      weightedAvgRate,
      standardRate: r.mat.standardRate ?? 0,
      valuationValue: round2(r.balance * weightedAvgRate),
    };
  });

  sendSuccess(res, result);
});

/* Physical Stock Verifications & Adjustment Approval */
router.get('/verifications', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const rows = await StockVerification.find(scope)
    .populate('project', 'code name')
    .populate('warehouse', 'code name')
    .populate('items.material', 'code name unit')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, rows.map((v) => ({ id: String(v._id), ...v })));
});

router.post('/verifications', can(CREATE), validate({ body: createVerificationSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const project = await Project.findById(req.body.project).lean();
  if (!project) throw ApiError.notFound('Project not found');

  const lines = [];
  for (const item of req.body.items) {
    const mat = await Material.findById(item.material).lean();
    if (!mat) throw ApiError.validation([{ field: 'items', message: 'Material not found' }]);
    const systemQty = await getCurrentStock(project._id, mat._id);
    const variance = round2(item.physicalQty - systemQty);
    lines.push({
      material: mat._id,
      systemQty,
      physicalQty: item.physicalQty,
      variance,
      unitRate: mat.standardRate ?? 0,
      reason: item.reason || '',
    });
  }

  const verificationNumber = await nextSequenceNumber('stockVerification', { prefixOverride: 'STKV', minPadding: 3 });
  const doc = await StockVerification.create({
    verificationNumber,
    project: project._id,
    site: req.body.site || null,
    warehouse: req.body.warehouse || null,
    items: lines,
    remarks: req.body.remarks,
    status: APPROVAL_STATUS.DRAFT,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await doc.populate('project', 'code name');
  await doc.populate('items.material', 'code name unit');
  sendSuccess(res, { id: String(doc._id), ...doc.toObject() }, { status: 201, message: 'Stock verification recorded' });
});

router.post(
  '/verifications/:id/transition',
  authorize(MODULES.INVENTORY, CREATE, UPDATE, APPROVE, REJECT),
  validate({ params: z.object({ id: objectId }), body: transitionSchema }),
  async (req, res) => {
    const scope = buildProjectScope(req.user, { projectField: 'project' });
    const doc = await StockVerification.findOne({ $and: [scope, { _id: req.validated.params.id }] });
    if (!doc) throw ApiError.notFound('Stock verification not found');

    await executeApprovalTransition(req.user, doc, {
      module: MODULES.INVENTORY,
      targetStatus: req.body.status,
      comment: req.body.comment,
    });

    if (req.body.status === APPROVAL_STATUS.APPROVED && !doc.adjustmentsPosted) {
      for (const line of doc.items) {
        if (!line.variance) continue;
        await recordTransaction(
          req.user,
          {
            project: String(doc.project),
            site: doc.site ? String(doc.site) : undefined,
            material: String(line.material),
            type: TRANSACTION_TYPES.ADJUSTMENT,
            quantity: Math.abs(line.variance),
            direction: line.variance < 0 ? 'decrease' : 'increase',
            unitRate: line.unitRate,
            referenceType: 'StockVerification',
            referenceId: doc._id,
            referenceNumber: doc.verificationNumber,
            remarks: line.reason || `Cycle count adjustment (${doc.verificationNumber})`,
          },
          { bypassAccessCheck: true },
        );
      }
      doc.adjustmentsPosted = true;
    }

    doc.updatedBy = req.user._id;
    await doc.save();
    recordAudit(req, { action: `stock_verification.${doc.status}`, module: MODULES.INVENTORY, entityType: 'StockVerification', entityId: doc._id, project: doc.project, summary: `${doc.verificationNumber} -> ${doc.status}` });
    sendSuccess(res, { id: String(doc._id), ...doc.toObject() }, { message: `Verification ${doc.status}` });
  },
);

export default router;

