import mongoose from 'mongoose';
import { approvalWorkflowPlugin } from './plugins/approvalWorkflow.js';

const { Schema } = mongoose;

const costCodeSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    name: { type: String, required: true, trim: true, maxlength: 140 },
    costHead: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const budgetLineSchema = new Schema(
  {
    costCode: { type: Schema.Types.ObjectId, ref: 'CostCode', default: null },
    costHead: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    boqItemRef: { type: Schema.Types.ObjectId, ref: 'BoqItem', default: null },
    originalAmount: { type: Number, min: 0, default: 0 },
    revisedAmount: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const revisionEntrySchema = new Schema(
  {
    version: { type: Number, required: true },
    reason: { type: String, trim: true, maxlength: 500, default: '' },
    deltaAmount: { type: Number, required: true },
    revisedTotal: { type: Number, required: true },
    changeOrderRef: { type: Schema.Types.ObjectId, ref: 'ChangeOrder', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const projectBudgetSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },
    originalBudget: { type: Number, required: true, min: 0, default: 0 },
    revisedBudget: { type: Number, required: true, min: 0, default: 0 },
    contingencyAmount: { type: Number, min: 0, default: 0 },
    lines: { type: [budgetLineSchema], default: [] },
    revisionHistory: { type: [revisionEntrySchema], default: [] },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
projectBudgetSchema.plugin(approvalWorkflowPlugin);

const expenseSchema = new Schema(
  {
    expenseNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    costCode: { type: Schema.Types.ObjectId, ref: 'CostCode', default: null },
    costHead: { type: String, trim: true, maxlength: 100, default: 'Site Overheads' },
    category: { type: String, trim: true, maxlength: 80, default: 'Site Expense' },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    expenseDate: { type: Date, default: Date.now, index: true },
    vendorName: { type: String, trim: true, maxlength: 150, default: '' },
    amount: { type: Number, required: true, min: 0.01 },
    taxAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0.01 },
    paidStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
expenseSchema.plugin(approvalWorkflowPlugin);
expenseSchema.index({ project: 1, expenseDate: -1 });

const invoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    invoiceType: {
      type: String,
      enum: ['vendor_ap', 'client_ar', 'contractor_payable'],
      required: true,
      index: true,
    },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', default: null },
    contractor: { type: Schema.Types.ObjectId, ref: 'Contractor', default: null },
    clientRef: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    clientName: { type: String, trim: true, maxlength: 150, default: '' },
    purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    goodsReceipt: { type: Schema.Types.ObjectId, ref: 'GoodsReceipt', default: null },
    contractorBill: { type: Schema.Types.ObjectId, ref: 'ContractorBill', default: null },
    milestone: { type: Schema.Types.ObjectId, ref: 'Milestone', default: null },
    externalRefNumber: { type: String, trim: true, maxlength: 80, default: '' },
    invoiceDate: { type: Date, default: Date.now },
    dueDate: Date,
    subtotal: { type: Number, required: true, min: 0 },
    cgstAmount: { type: Number, min: 0, default: 0 },
    sgstAmount: { type: Number, min: 0, default: 0 },
    igstAmount: { type: Number, min: 0, default: 0 },
    tdsPercent: { type: Number, min: 0, max: 30, default: 0 },
    tdsAmount: { type: Number, min: 0, default: 0 },
    retentionPercent: { type: Number, min: 0, max: 30, default: 0 },
    retentionAmount: { type: Number, min: 0, default: 0 },
    netPayable: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'verified', 'approved', 'partial', 'paid', 'cancelled'],
      default: 'draft',
      index: true,
    },
    threeWayMatchPassed: { type: Boolean, default: false },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const paymentSchema = new Schema(
  {
    paymentNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    direction: { type: String, enum: ['inflow', 'outflow'], required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    tdsDeducted: { type: Number, min: 0, default: 0 },
    paymentDate: { type: Date, default: Date.now, index: true },
    mode: { type: String, enum: ['neft', 'rtgs', 'cheque', 'upi', 'cash'], default: 'neft' },
    referenceNo: { type: String, trim: true, maxlength: 80, default: '' },
    remarks: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const CostCode = mongoose.models.CostCode || mongoose.model('CostCode', costCodeSchema);
export const ProjectBudget = mongoose.models.ProjectBudget || mongoose.model('ProjectBudget', projectBudgetSchema);
export const Expense = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
export const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
export const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

