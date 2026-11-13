import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ContractorBill, WorkOrder } from '../../models/Contractor.js';
import { CostCode, Expense, Invoice, Payment, ProjectBudget } from '../../models/Finance.js';
import { GoodsReceipt } from '../../models/GoodsReceipt.js';
import { PayrollRun } from '../../models/Hr.js';
import { InventoryTransaction, TRANSACTION_TYPES } from '../../models/InventoryTransaction.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { Project } from '../../models/Project.js';
import { PurchaseOrder } from '../../models/PurchaseOrder.js';
import { executeApprovalTransition } from '../../services/approval.service.js';
import { recordAudit } from '../../services/audit.service.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { paginate, parsePagination } from '../../utils/pagination.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';

const { CREATE, READ, UPDATE, APPROVE, REJECT } = ACTIONS;
const can = (action) => authorize(MODULES.FINANCE, action);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');
const nullableId = z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null);
const text = (max) => z.string().trim().max(max);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const costCodeSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(24),
  name: z.string().trim().min(2).max(140),
  costHead: z.string().trim().min(1).max(100),
  description: text(500).optional().default(''),
});

const budgetSchema = z.object({
  project: objectId,
  originalBudget: z.coerce.number().min(0),
  contingencyAmount: z.coerce.number().min(0).optional().default(0),
  notes: text(1000).optional().default(''),
  lines: z
    .array(
      z.object({
        costCode: nullableId.optional(),
        costHead: z.string().trim().min(1).max(100),
        description: text(300).optional().default(''),
        originalAmount: z.coerce.number().min(0),
      }),
    )
    .optional()
    .default([]),
});

const reviseBudgetSchema = z.object({
  deltaAmount: z.coerce.number(),
  reason: z.string().trim().min(2).max(500),
  changeOrderRef: nullableId.optional(),
});

const expenseSchema = z.object({
  project: objectId,
  site: nullableId.optional(),
  costCode: nullableId.optional(),
  costHead: text(100).optional().default('Site Overheads'),
  category: text(80).optional().default('Site Expense'),
  description: z.string().trim().min(2).max(500),
  expenseDate: z.string().optional(),
  vendorName: text(150).optional().default(''),
  amount: z.coerce.number().positive(),
  taxAmount: z.coerce.number().min(0).optional().default(0),
});

const transitionSchema = z.object({
  status: z.enum(Object.values(APPROVAL_STATUS)),
  comment: text(500).optional().default(''),
});

const invoiceSchema = z.object({
  invoiceType: z.enum(['vendor_ap', 'client_ar', 'contractor_payable']),
  project: objectId,
  vendor: nullableId.optional(),
  contractor: nullableId.optional(),
  clientRef: nullableId.optional(),
  clientName: text(150).optional().default(''),
  purchaseOrder: nullableId.optional(),
  goodsReceipt: nullableId.optional(),
  milestone: nullableId.optional(),
  externalRefNumber: text(80).optional().default(''),
  dueDate: z.string().optional(),
  subtotal: z.coerce.number().min(0),
  cgstAmount: z.coerce.number().min(0).optional().default(0),
  sgstAmount: z.coerce.number().min(0).optional().default(0),
  igstAmount: z.coerce.number().min(0).optional().default(0),
  tdsPercent: z.coerce.number().min(0).max(30).optional().default(0),
  retentionPercent: z.coerce.number().min(0).max(30).optional().default(0),
  notes: text(1000).optional().default(''),
});

const paymentSchema = z.object({
  invoice: objectId,
  amount: z.coerce.number().positive(),
  tdsDeducted: z.coerce.number().min(0).optional().default(0),
  paymentDate: z.string().optional(),
  mode: z.enum(['neft', 'rtgs', 'cheque', 'upi', 'cash']).optional().default('neft'),
  referenceNo: text(80).optional().default(''),
  remarks: text(500).optional().default(''),
});

const router = Router();
router.use(authenticate);

/* =========================================================================
 * COST CODES
 * ========================================================================= */
router.get('/cost-codes', can(READ), async (_req, res) => {
  const rows = await CostCode.find().sort({ code: 1 }).lean();
  sendSuccess(res, rows.map((c) => ({ id: String(c._id), ...c })));
});

router.post('/cost-codes', can(CREATE), validate({ body: costCodeSchema }), async (req, res) => {
  const exists = await CostCode.findOne({ code: req.body.code });
  if (exists) throw ApiError.conflict('Cost code already exists');
  const cc = await CostCode.create({ ...req.body, createdBy: req.user._id });
  sendSuccess(res, { id: String(cc._id), ...cc.toObject() }, { status: 201, message: 'Cost code created' });
});

/* =========================================================================
 * PROJECT BUDGETS & COST CONTROL (COMMITMENTS VS ACTUAL VS FORECAST)
 * ========================================================================= */
router.get('/budgets', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const filter = req.query.project ? { $and: [scope, { project: req.query.project }] } : scope;
  const rows = await ProjectBudget.find(filter).populate('project', 'code name contractValue').sort({ createdAt: -1 }).lean();
  sendSuccess(res, rows.map((b) => ({ id: String(b._id), ...b })));
});

router.post('/budgets', can(CREATE), validate({ body: budgetSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const existing = await ProjectBudget.findOne({ project: req.body.project });
  if (existing) throw ApiError.conflict('Budget already exists for this project. Use budget revision instead.');

  const lines = (req.body.lines ?? []).map((l) => ({
    ...l,
    revisedAmount: l.originalAmount,
  }));
  const budget = await ProjectBudget.create({
    project: req.body.project,
    originalBudget: req.body.originalBudget,
    revisedBudget: req.body.originalBudget,
    contingencyAmount: req.body.contingencyAmount ?? 0,
    lines,
    notes: req.body.notes,
    status: APPROVAL_STATUS.APPROVED,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await budget.populate('project', 'code name contractValue');
  sendSuccess(res, { id: String(budget._id), ...budget.toObject() }, { status: 201, message: 'Project budget created' });
});

router.post('/budgets/:id/revise', can(APPROVE), validate({ params: z.object({ id: objectId }), body: reviseBudgetSchema }), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const budget = await ProjectBudget.findOne({ $and: [scope, { _id: req.validated.params.id }] });
  if (!budget) throw ApiError.notFound('Project budget not found');

  const nextTotal = round2((budget.revisedBudget ?? budget.originalBudget) + req.body.deltaAmount);
  if (nextTotal < 0) throw ApiError.badRequest('Revised budget cannot be negative');

  const nextVersion = (budget.revisionHistory?.length ?? 0) + 1;
  budget.revisedBudget = nextTotal;
  budget.revisionHistory.push({
    version: nextVersion,
    reason: req.body.reason,
    deltaAmount: req.body.deltaAmount,
    revisedTotal: nextTotal,
    changeOrderRef: req.body.changeOrderRef || null,
    approvedBy: req.user._id,
  });
  budget.updatedBy = req.user._id;
  await budget.save();
  recordAudit(req, { action: 'budget.revise', module: MODULES.FINANCE, entityType: 'ProjectBudget', entityId: budget._id, project: budget.project, summary: `Revised budget -> ${nextTotal}` });
  sendSuccess(res, { id: String(budget._id), ...budget.toObject() }, { message: 'Budget revised' });
});

router.get('/cost-control', can(READ), async (req, res) => {
  if (!req.query.project || !mongoose.isValidObjectId(req.query.project)) {
    throw ApiError.badRequest('Specify a valid project id');
  }
  if (!canAccessProject(req.user, req.query.project)) throw ApiError.notFound('Project not found');
  const projectId = new mongoose.Types.ObjectId(req.query.project);

  const [project, budget, poAgg, expAgg, matAgg, billAgg, payrollAgg, woAgg] = await Promise.all([
    Project.findById(projectId).select('code name contractValue').lean(),
    ProjectBudget.findOne({ project: projectId }).lean(),
    PurchaseOrder.aggregate([
      { $match: { project: projectId, status: { $in: [APPROVAL_STATUS.SUBMITTED, APPROVAL_STATUS.UNDER_REVIEW, APPROVAL_STATUS.APPROVED] } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } },
    ]),
    Expense.aggregate([
      { $match: { project: projectId, status: APPROVAL_STATUS.APPROVED } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    InventoryTransaction.aggregate([
      { $match: { project: projectId, type: TRANSACTION_TYPES.ISSUE } },
      { $group: { _id: null, total: { $sum: '$totalValue' } } },
    ]),
    ContractorBill.aggregate([
      { $match: { project: projectId, status: APPROVAL_STATUS.APPROVED } },
      { $group: { _id: null, total: { $sum: '$netPayable' } } },
    ]),
    PayrollRun.aggregate([
      { $match: { project: projectId, status: APPROVAL_STATUS.APPROVED } },
      { $group: { _id: null, total: { $sum: '$totalNet' } } },
    ]),
    WorkOrder.aggregate([
      { $match: { project: projectId, status: 'active' } },
      { $group: { _id: null, total: { $sum: '$contractValue' } } },
    ]),
  ]);

  if (!project) throw ApiError.notFound('Project not found');
  const originalBudget = round2(budget?.originalBudget ?? project.contractValue ?? 0);
  const revisedBudget = round2(budget?.revisedBudget ?? originalBudget);
  const poCommitments = round2(poAgg[0]?.total ?? 0);
  const woCommitments = round2(woAgg[0]?.total ?? 0);
  const totalCommitted = round2(poCommitments + woCommitments);

  const approvedExpenses = round2(expAgg[0]?.total ?? 0);
  const materialIssues = round2(matAgg[0]?.total ?? 0);
  const contractorBills = round2(billAgg[0]?.total ?? 0);
  const payrollCost = round2(payrollAgg[0]?.total ?? 0);
  const totalActualCost = round2(approvedExpenses + materialIssues + contractorBills + payrollCost);
  const eac = round2(Math.max(revisedBudget, totalActualCost));
  const variance = round2(revisedBudget - totalActualCost);

  sendSuccess(res, {
    project: { id: String(project._id), code: project.code, name: project.name, contractValue: project.contractValue },
    originalBudget,
    revisedBudget,
    commitments: { purchaseOrders: poCommitments, workOrders: woCommitments, totalCommitted },
    actuals: { expenses: approvedExpenses, materialIssues, contractorBills, payrollCost, totalActualCost },
    forecastEac: eac,
    variance,
  });
});

/* =========================================================================
 * EXPENSES (WITH PM APPROVAL LIMIT)
 * ========================================================================= */
router.get('/expenses', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const filter = { ...scope };
  if (req.query.project) filter.project = req.query.project;
  if (req.query.status) filter.status = req.query.status;
  const pagination = parsePagination(req.query, { allowedSortFields: ['expenseDate', 'createdAt', 'totalAmount'], defaultSort: '-expenseDate' });
  const { items, meta } = await paginate(Expense, filter, pagination, {
    populate: [{ path: 'project', select: 'code name' }, { path: 'createdBy', select: 'firstName lastName' }],
  });
  sendSuccess(res, items.map((e) => ({ id: String(e._id), ...e.toObject() })), { meta });
});

router.post('/expenses', can(CREATE), validate({ body: expenseSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const expenseNumber = await nextSequenceNumber('expense', { prefixOverride: 'EXP', minPadding: 4 });
  const totalAmount = round2(req.body.amount + (req.body.taxAmount ?? 0));
  const exp = await Expense.create({
    ...req.body,
    expenseNumber,
    expenseDate: req.body.expenseDate ? new Date(req.body.expenseDate) : new Date(),
    totalAmount,
    status: APPROVAL_STATUS.DRAFT,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await exp.populate('project', 'code name');
  sendSuccess(res, { id: String(exp._id), ...exp.toObject() }, { status: 201, message: `Expense ${expenseNumber} created` });
});

router.post(
  '/expenses/:id/transition',
  authorize(MODULES.FINANCE, CREATE, UPDATE, APPROVE, REJECT),
  validate({ params: z.object({ id: objectId }), body: transitionSchema }),
  async (req, res) => {
    const scope = buildProjectScope(req.user, { projectField: 'project' });
    const exp = await Expense.findOne({ $and: [scope, { _id: req.validated.params.id }] });
    if (!exp) throw ApiError.notFound('Expense not found');

    await executeApprovalTransition(req.user, exp, {
      module: MODULES.FINANCE,
      targetStatus: req.body.status,
      comment: req.body.comment,
      amount: exp.totalAmount,
    });
    exp.updatedBy = req.user._id;
    await exp.save();
    recordAudit(req, { action: `expense.${exp.status}`, module: MODULES.FINANCE, entityType: 'Expense', entityId: exp._id, project: exp.project, summary: `${exp.expenseNumber} -> ${exp.status}` });
    await exp.populate('project', 'code name');
    sendSuccess(res, { id: String(exp._id), ...exp.toObject() }, { message: `Expense ${exp.status}` });
  },
);

/* =========================================================================
 * INVOICES (VENDOR 3-WAY MATCH AP, CLIENT AR, CONTRACTOR PAYABLE)
 * ========================================================================= */
router.get('/invoices', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const filter = { ...scope };
  if (req.query.project) filter.project = req.query.project;
  if (req.query.invoiceType) filter.invoiceType = req.query.invoiceType;
  if (req.query.status) filter.status = req.query.status;
  const rows = await Invoice.find(filter)
    .populate('project', 'code name')
    .populate('vendor', 'code name')
    .populate('contractor', 'code companyName')
    .populate('purchaseOrder', 'poNumber grandTotal')
    .populate('goodsReceipt', 'grnNumber')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, rows.map((i) => ({ id: String(i._id), balanceDue: round2(i.netPayable - (i.paidAmount || 0)), ...i })));
});

router.post('/invoices', can(CREATE), validate({ body: invoiceSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');

  let threeWayMatchPassed = false;
  if (req.body.invoiceType === 'vendor_ap' && req.body.purchaseOrder) {
    const po = await PurchaseOrder.findById(req.body.purchaseOrder).lean();
    if (!po || String(po.project) !== String(req.body.project)) {
      throw ApiError.badRequest('Selected Purchase Order does not belong to this project');
    }
    if (req.body.goodsReceipt) {
      const grn = await GoodsReceipt.findById(req.body.goodsReceipt).lean();
      if (!grn || String(grn.purchaseOrder) !== String(po._id)) {
        throw ApiError.badRequest('3-way match failed: GRN does not match the selected Purchase Order');
      }
      const rateByMat = new Map(po.items.map((pi) => [String(pi.material), pi.unitRate]));
      const grnValue = grn.items.reduce((sum, gi) => sum + gi.receivedQuantity * (rateByMat.get(String(gi.material)) ?? 0), 0);
      if (req.body.subtotal > round2(grnValue) + 1) {
        throw ApiError.badRequest(`3-way match failed: Invoice subtotal (₹${req.body.subtotal}) exceeds GRN received value (₹${round2(grnValue)})`);
      }
      threeWayMatchPassed = true;
    } else if (req.body.subtotal > po.subtotal + 1) {
      throw ApiError.badRequest(`Invoice subtotal (₹${req.body.subtotal}) exceeds PO subtotal (₹${po.subtotal})`);
    }
  }

  const gstTotal = round2((req.body.cgstAmount ?? 0) + (req.body.sgstAmount ?? 0) + (req.body.igstAmount ?? 0));
  const tdsAmount = round2((req.body.subtotal * (req.body.tdsPercent ?? 0)) / 100);
  const retentionAmount = round2((req.body.subtotal * (req.body.retentionPercent ?? 0)) / 100);
  const netPayable = round2(req.body.subtotal + gstTotal - tdsAmount - retentionAmount);

  const invoiceNumber = await nextSequenceNumber('invoice', { prefixOverride: 'INV', minPadding: 4 });
  const inv = await Invoice.create({
    ...req.body,
    invoiceNumber,
    dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
    tdsAmount,
    retentionAmount,
    netPayable,
    threeWayMatchPassed,
    status: threeWayMatchPassed ? 'verified' : 'approved',
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await inv.populate('project vendor contractor purchaseOrder goodsReceipt');
  sendSuccess(res, { id: String(inv._id), balanceDue: inv.netPayable, ...inv.toObject() }, { status: 201, message: `Invoice ${invoiceNumber} created` });
});

/* =========================================================================
 * PAYMENTS & CASH FLOW
 * ========================================================================= */
router.get('/payments', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const filter = req.query.project ? { $and: [scope, { project: req.query.project }] } : scope;
  const rows = await Payment.find(filter)
    .populate('project', 'code name')
    .populate('invoice', 'invoiceNumber invoiceType netPayable')
    .sort({ paymentDate: -1 })
    .lean();
  sendSuccess(res, rows.map((p) => ({ id: String(p._id), ...p })));
});

router.post('/payments', can(CREATE), validate({ body: paymentSchema }), async (req, res) => {
  const inv = await Invoice.findById(req.body.invoice);
  if (!inv || !canAccessProject(req.user, inv.project)) throw ApiError.notFound('Invoice not found');

  const remaining = round2(inv.netPayable - (inv.paidAmount || 0));
  if (req.body.amount > remaining + 0.01) {
    throw ApiError.badRequest(`Payment (₹${req.body.amount}) exceeds remaining invoice balance (₹${remaining})`);
  }

  const direction = inv.invoiceType === 'client_ar' ? 'inflow' : 'outflow';
  const paymentNumber = await nextSequenceNumber('payment', { prefixOverride: 'PAY', minPadding: 4 });
  const pay = await Payment.create({
    paymentNumber,
    direction,
    project: inv.project,
    invoice: inv._id,
    amount: req.body.amount,
    tdsDeducted: req.body.tdsDeducted ?? 0,
    paymentDate: req.body.paymentDate ? new Date(req.body.paymentDate) : new Date(),
    mode: req.body.mode,
    referenceNo: req.body.referenceNo,
    remarks: req.body.remarks,
    createdBy: req.user._id,
  });

  inv.paidAmount = round2((inv.paidAmount || 0) + req.body.amount);
  inv.status = inv.paidAmount >= inv.netPayable - 0.01 ? 'paid' : 'partial';
  inv.updatedBy = req.user._id;
  await inv.save();

  recordAudit(req, { action: 'payment.create', module: MODULES.FINANCE, entityType: 'Payment', entityId: pay._id, project: pay.project, summary: `Recorded ${direction} ${paymentNumber} (₹${pay.amount})` });
  await pay.populate('project invoice');
  sendSuccess(res, { id: String(pay._id), ...pay.toObject(), invoiceStatus: inv.status }, { status: 201, message: `Payment ${paymentNumber} recorded` });
});

router.get('/cash-flow', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const match = req.query.project ? { $and: [scope, { project: new mongoose.Types.ObjectId(req.query.project) }] } : scope;
  if (match.project?.$in) match.project.$in = match.project.$in.map((id) => new mongoose.Types.ObjectId(id));

  const [payAgg, invAgg] = await Promise.all([
    Payment.aggregate([
      { $match: match },
      { $group: { _id: '$direction', total: { $sum: '$amount' } } },
    ]),
    Invoice.aggregate([
      { $match: { $and: [match, { status: { $ne: 'cancelled' } }] } },
      {
        $group: {
          _id: '$invoiceType',
          billed: { $sum: '$netPayable' },
          paid: { $sum: '$paidAmount' },
        },
      },
    ]),
  ]);

  const inflow = round2(payAgg.find((p) => p._id === 'inflow')?.total ?? 0);
  const outflow = round2(payAgg.find((p) => p._id === 'outflow')?.total ?? 0);
  const arRow = invAgg.find((i) => i._id === 'client_ar') ?? { billed: 0, paid: 0 };
  const apTotal = invAgg
    .filter((i) => i._id !== 'client_ar')
    .reduce((acc, r) => ({ billed: acc.billed + r.billed, paid: acc.paid + r.paid }), { billed: 0, paid: 0 });

  sendSuccess(res, {
    totalInflow: inflow,
    totalOutflow: outflow,
    netCashFlow: round2(inflow - outflow),
    receivablesPending: round2(arRow.billed - arRow.paid),
    payablesPending: round2(apTotal.billed - apTotal.paid),
  });
});

export default router;

