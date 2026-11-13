import mongoose from 'mongoose';
import { approvalWorkflowPlugin } from './plugins/approvalWorkflow.js';

const { Schema } = mongoose;

const contractorSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    companyName: { type: String, required: true, trim: true, maxlength: 150 },
    contactPerson: { type: String, trim: true, maxlength: 120, default: '' },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
    gstin: { type: String, trim: true, uppercase: true, maxlength: 20, default: '' },
    pan: { type: String, trim: true, uppercase: true, maxlength: 15, default: '' },
    tradeCategories: [{ type: String, trim: true, maxlength: 80 }],
    rating: { type: Number, min: 1, max: 5, default: 4 },
    isActive: { type: Boolean, default: true, index: true },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const workOrderSchema = new Schema(
  {
    woNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    contractor: { type: Schema.Types.ObjectId, ref: 'Contractor', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    workPackage: { type: String, trim: true, maxlength: 120, default: '' },
    contractValue: { type: Number, required: true, min: 0 },
    retentionPercent: { type: Number, min: 0, max: 25, default: 5 },
    advanceAmount: { type: Number, min: 0, default: 0 },
    advanceRecovered: { type: Number, min: 0, default: 0 },
    tdsPercent: { type: Number, min: 0, max: 20, default: 2 },
    startDate: Date,
    endDate: Date,
    status: { type: String, enum: ['active', 'completed', 'terminated'], default: 'active', index: true },
    scopeNotes: { type: String, trim: true, maxlength: 2000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const measurementEntrySchema = new Schema(
  {
    mbNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    workOrder: { type: Schema.Types.ObjectId, ref: 'WorkOrder', required: true, index: true },
    contractor: { type: Schema.Types.ObjectId, ref: 'Contractor', required: true },
    measurementDate: { type: Date, default: Date.now },
    description: { type: String, required: true, trim: true, maxlength: 400 },
    unit: { type: String, required: true, trim: true, maxlength: 30 },
    length: { type: Number, min: 0, default: 0 },
    width: { type: Number, min: 0, default: 0 },
    depth: { type: Number, min: 0, default: 0 },
    multiplier: { type: Number, min: 0, default: 1 },
    quantity: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['recorded', 'verified', 'billed'], default: 'recorded' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

const contractorBillSchema = new Schema(
  {
    billNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    workOrder: { type: Schema.Types.ObjectId, ref: 'WorkOrder', required: true, index: true },
    contractor: { type: Schema.Types.ObjectId, ref: 'Contractor', required: true, index: true },
    billType: { type: String, enum: ['ra_bill', 'final_bill'], default: 'ra_bill' },
    billDate: { type: Date, default: Date.now },
    cumulativeWorkValue: { type: Number, required: true, min: 0 },
    previousBillsValue: { type: Number, min: 0, default: 0 },
    grossCurrentBill: { type: Number, required: true, min: 0 },
    retentionAmount: { type: Number, min: 0, default: 0 },
    advanceRecovery: { type: Number, min: 0, default: 0 },
    tdsAmount: { type: Number, min: 0, default: 0 },
    gstPercent: { type: Number, min: 0, max: 30, default: 18 },
    gstAmount: { type: Number, min: 0, default: 0 },
    netPayable: { type: Number, required: true, min: 0 },
    financeInvoice: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
    remarks: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
contractorBillSchema.plugin(approvalWorkflowPlugin);

export const Contractor = mongoose.models.Contractor || mongoose.model('Contractor', contractorSchema);
export const WorkOrder = mongoose.models.WorkOrder || mongoose.model('WorkOrder', workOrderSchema);
export const MeasurementEntry =
  mongoose.models.MeasurementEntry || mongoose.model('MeasurementEntry', measurementEntrySchema);
export const ContractorBill =
  mongoose.models.ContractorBill || mongoose.model('ContractorBill', contractorBillSchema);

