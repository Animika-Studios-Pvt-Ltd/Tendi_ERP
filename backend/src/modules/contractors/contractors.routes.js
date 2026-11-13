import { Router } from 'express';
import { z } from 'zod';
import { ACTIONS, DATA_SCOPES, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { Contractor, ContractorBill, MeasurementEntry, WorkOrder } from '../../models/Contractor.js';
import { Invoice } from '../../models/Finance.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { executeApprovalTransition } from '../../services/approval.service.js';
import { recordAudit } from '../../services/audit.service.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { buildOwnershipScope, buildProjectScope, canAccessProject } from '../../utils/scope.js';

const { CREATE, READ, UPDATE, APPROVE, REJECT } = ACTIONS;
const can = (action) => authorize(MODULES.CONTRACTORS, action);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');
const nullableId = z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null);
const text = (max) => z.string().trim().max(max);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function contractorScope(user) {
  if (!user?.role) return { _id: null };
  if (user.role.dataScope === DATA_SCOPES.ALL) return {};
  if (user.role.dataScope === DATA_SCOPES.OWN) {
    return buildOwnershipScope(user, { projectField: 'project', ownerField: 'contractor', ownerValue: user.contractor });
  }
  return buildProjectScope(user, { projectField: 'project' });
}

const createContractorSchema = z.object({
  companyName: z.string().trim().min(2).max(150),
  contactPerson: text(120).optional().default(''),
  phone: text(20).optional().default(''),
  email: text(120).optional().default(''),
  gstin: text(20).optional().default(''),
  pan: text(15).optional().default(''),
  tradeCategories: z.array(z.string().trim().max(80)).optional().default([]),
  notes: text(1000).optional().default(''),
});

const createWoSchema = z.object({
  project: objectId,
  site: nullableId.optional(),
  contractor: objectId,
  title: z.string().trim().min(2).max(180),
  workPackage: text(120).optional().default(''),
  contractValue: z.coerce.number().min(0),
  retentionPercent: z.coerce.number().min(0).max(25).optional().default(5),
  advanceAmount: z.coerce.number().min(0).optional().default(0),
  tdsPercent: z.coerce.number().min(0).max(20).optional().default(2),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  scopeNotes: text(2000).optional().default(''),
});

const createMbSchema = z.object({
  workOrder: objectId,
  site: nullableId.optional(),
  description: z.string().trim().min(2).max(400),
  unit: z.string().trim().min(1).max(30),
  length: z.coerce.number().min(0).optional().default(0),
  width: z.coerce.number().min(0).optional().default(0),
  depth: z.coerce.number().min(0).optional().default(0),
  multiplier: z.coerce.number().min(0).optional().default(1),
  quantity: z.coerce.number().min(0).optional(),
  rate: z.coerce.number().min(0),
});

const createBillSchema = z.object({
  workOrder: objectId,
  billType: z.enum(['ra_bill', 'final_bill']).optional().default('ra_bill'),
  cumulativeWorkValue: z.coerce.number().min(0),
  advanceRecovery: z.coerce.number().min(0).optional().default(0),
  gstPercent: z.coerce.number().min(0).max(30).optional().default(18),
  remarks: text(1000).optional().default(''),
});

const transitionSchema = z.object({
  status: z.enum(Object.values(APPROVAL_STATUS)),
  comment: text(500).optional().default(''),
});

const router = Router();
router.use(authenticate);

/* Contractors Master */
router.get('/contractors', can(READ), async (req, res) => {
  const filter =
    req.user.role?.dataScope === DATA_SCOPES.OWN && req.user.contractor
      ? { _id: req.user.contractor }
      : {};
  const rows = await Contractor.find(filter).sort({ companyName: 1 }).lean();
  sendSuccess(res, rows.map((c) => ({ id: String(c._id), ...c })));
});

router.post('/contractors', can(CREATE), validate({ body: createContractorSchema }), async (req, res) => {
  const code = await nextSequenceNumber('contractor', { prefixOverride: 'CON', minPadding: 3 });
  const c = await Contractor.create({ ...req.body, code, createdBy: req.user._id });
  sendSuccess(res, { id: String(c._id), ...c.toObject() }, { status: 201, message: 'Contractor registered' });
});

/* Work Orders */
router.get('/work-orders', can(READ), async (req, res) => {
  const scope = contractorScope(req.user);
  const filter = req.query.project ? { $and: [scope, { project: req.query.project }] } : scope;
  const rows = await WorkOrder.find(filter)
    .populate('project', 'code name')
    .populate('contractor', 'code companyName')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, rows.map((w) => ({ id: String(w._id), ...w })));
});

router.post('/work-orders', can(CREATE), validate({ body: createWoSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const woNumber = await nextSequenceNumber('workOrder', { prefixOverride: 'WO', minPadding: 3 });
  const wo = await WorkOrder.create({
    ...req.body,
    woNumber,
    startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
    endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await wo.populate('project contractor');
  sendSuccess(res, { id: String(wo._id), ...wo.toObject() }, { status: 201, message: `Work order ${woNumber} created` });
});

/* Measurement Book (MB) */
router.get('/measurements', can(READ), async (req, res) => {
  const scope = contractorScope(req.user);
  const filter = req.query.workOrder ? { $and: [scope, { workOrder: req.query.workOrder }] } : scope;
  const rows = await MeasurementEntry.find(filter)
    .populate('project', 'code name')
    .populate('workOrder', 'woNumber title')
    .populate('contractor', 'code companyName')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, rows.map((m) => ({ id: String(m._id), ...m })));
});

router.post('/measurements', can(CREATE), validate({ body: createMbSchema }), async (req, res) => {
  const wo = await WorkOrder.findById(req.body.workOrder).lean();
  if (!wo || !canAccessProject(req.user, wo.project)) throw ApiError.notFound('Work order not found');

  let qty = req.body.quantity;
  if (qty == null || qty === 0) {
    const dims = [req.body.length, req.body.width, req.body.depth].filter((v) => Number(v) > 0);
    qty = dims.length > 0 ? round2(dims.reduce((a, v) => a * Number(v), 1) * (req.body.multiplier || 1)) : 0;
  }
  const amount = round2(qty * req.body.rate);
  const mbNumber = await nextSequenceNumber('contractorBill', { prefixOverride: 'MB', minPadding: 3 });

  const mb = await MeasurementEntry.create({
    mbNumber,
    project: wo.project,
    site: req.body.site || wo.site || null,
    workOrder: wo._id,
    contractor: wo.contractor,
    description: req.body.description,
    unit: req.body.unit,
    length: req.body.length,
    width: req.body.width,
    depth: req.body.depth,
    multiplier: req.body.multiplier,
    quantity: qty,
    rate: req.body.rate,
    amount,
    status: 'verified',
    createdBy: req.user._id,
  });
  sendSuccess(res, { id: String(mb._id), ...mb.toObject() }, { status: 201, message: 'Measurement recorded' });
});

/* RA Bills & Settlement (syncs Finance Contractor Payable Invoice upon approval) */
router.get('/bills', can(READ), async (req, res) => {
  const scope = contractorScope(req.user);
  const filter = req.query.project ? { $and: [scope, { project: req.query.project }] } : scope;
  const rows = await ContractorBill.find(filter)
    .populate('project', 'code name')
    .populate('workOrder', 'woNumber title contractValue')
    .populate('contractor', 'code companyName')
    .populate('financeInvoice', 'invoiceNumber status netPayable paidAmount')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, rows.map((b) => ({ id: String(b._id), ...b })));
});

router.post('/bills', can(CREATE), validate({ body: createBillSchema }), async (req, res) => {
  const wo = await WorkOrder.findById(req.body.workOrder).lean();
  if (!wo || !canAccessProject(req.user, wo.project)) throw ApiError.notFound('Work order not found');
  if (req.user.role?.dataScope === DATA_SCOPES.OWN && req.user.contractor && String(wo.contractor) !== String(req.user.contractor)) {
    throw ApiError.notFound('Work order not found');
  }

  const priorBills = await ContractorBill.find({
    workOrder: wo._id,
    status: { $in: [APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.SUBMITTED, APPROVAL_STATUS.UNDER_REVIEW] },
  })
    .select('grossCurrentBill')
    .lean();
  const previousBillsValue = round2(priorBills.reduce((s, b) => s + (b.grossCurrentBill || 0), 0));
  const grossCurrentBill = round2(req.body.cumulativeWorkValue - previousBillsValue);
  if (grossCurrentBill <= 0) {
    throw ApiError.badRequest(`Cumulative work value (₹${req.body.cumulativeWorkValue}) must exceed previous billed total (₹${previousBillsValue})`);
  }

  const retentionAmount = round2((grossCurrentBill * (wo.retentionPercent ?? 0)) / 100);
  const tdsAmount = round2((grossCurrentBill * (wo.tdsPercent ?? 0)) / 100);
  const gstAmount = round2((grossCurrentBill * (req.body.gstPercent ?? 18)) / 100);
  const advanceRecovery = round2(req.body.advanceRecovery ?? 0);
  const netPayable = round2(Math.max(0, grossCurrentBill + gstAmount - retentionAmount - advanceRecovery - tdsAmount));

  const billNumber = await nextSequenceNumber('contractorBill', { prefixOverride: 'RAB', minPadding: 3 });
  const bill = await ContractorBill.create({
    billNumber,
    project: wo.project,
    workOrder: wo._id,
    contractor: wo.contractor,
    billType: req.body.billType,
    cumulativeWorkValue: req.body.cumulativeWorkValue,
    previousBillsValue,
    grossCurrentBill,
    retentionAmount,
    advanceRecovery,
    tdsAmount,
    gstPercent: req.body.gstPercent,
    gstAmount,
    netPayable,
    remarks: req.body.remarks,
    status: APPROVAL_STATUS.DRAFT,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await bill.populate('project workOrder contractor');
  sendSuccess(res, { id: String(bill._id), ...bill.toObject() }, { status: 201, message: `RA Bill ${billNumber} drafted` });
});

router.post(
  '/bills/:id/transition',
  authorize(MODULES.CONTRACTORS, CREATE, UPDATE, APPROVE, REJECT),
  validate({ params: z.object({ id: objectId }), body: transitionSchema }),
  async (req, res) => {
    const scope = contractorScope(req.user);
    const bill = await ContractorBill.findOne({ $and: [scope, { _id: req.validated.params.id }] });
    if (!bill) throw ApiError.notFound('Contractor bill not found');

    await executeApprovalTransition(req.user, bill, {
      module: MODULES.CONTRACTORS,
      targetStatus: req.body.status,
      comment: req.body.comment,
      amount: bill.netPayable,
    });

    if (req.body.status === APPROVAL_STATUS.APPROVED && !bill.financeInvoice) {
      const wo = await WorkOrder.findById(bill.workOrder);
      if (wo && bill.advanceRecovery > 0) {
        wo.advanceRecovered = round2((wo.advanceRecovered || 0) + bill.advanceRecovery);
        await wo.save();
      }
      const invoiceNumber = await nextSequenceNumber('invoice', { prefixOverride: 'INV', minPadding: 4 });
      const inv = await Invoice.create({
        invoiceNumber,
        invoiceType: 'contractor_payable',
        project: bill.project,
        contractor: bill.contractor,
        contractorBill: bill._id,
        externalRefNumber: bill.billNumber,
        subtotal: bill.grossCurrentBill,
        cgstAmount: round2(bill.gstAmount / 2),
        sgstAmount: round2(bill.gstAmount / 2),
        tdsAmount: bill.tdsAmount,
        retentionAmount: bill.retentionAmount,
        netPayable: bill.netPayable,
        status: 'approved',
        notes: `Auto-generated from ${bill.billNumber}`,
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });
      bill.financeInvoice = inv._id;
    }

    bill.updatedBy = req.user._id;
    await bill.save();
    recordAudit(req, { action: `contractor_bill.${bill.status}`, module: MODULES.CONTRACTORS, entityType: 'ContractorBill', entityId: bill._id, project: bill.project, summary: `${bill.billNumber} -> ${bill.status}` });
    await bill.populate('project workOrder contractor financeInvoice');
    sendSuccess(res, { id: String(bill._id), ...bill.toObject() }, { message: `RA Bill ${bill.status}` });
  },
);

export default router;

