import mongoose from 'mongoose';
import { approvalWorkflowPlugin } from './plugins/approvalWorkflow.js';

const { Schema } = mongoose;

const amendmentSchema = new Schema(
  {
    amendmentNo: { type: Number, required: true },
    summary: { type: String, required: true, trim: true, maxlength: 1000 },
    valueDelta: { type: Number, default: 0 },
    effectiveDate: { type: Date, default: Date.now },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

const legalAgreementSchema = new Schema(
  {
    agreementNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    partyType: { type: String, enum: ['client', 'vendor', 'contractor', 'other'], default: 'contractor' },
    partyName: { type: String, required: true, trim: true, maxlength: 160 },
    vendorRef: { type: Schema.Types.ObjectId, ref: 'Vendor', default: null },
    contractorRef: { type: Schema.Types.ObjectId, ref: 'Contractor', default: null },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    effectiveDate: Date,
    expiryDate: { type: Date, index: true },
    contractValue: { type: Number, min: 0, default: 0 },
    obligations: { type: String, trim: true, maxlength: 2000, default: '' },
    lifecycleStatus: {
      type: String,
      enum: ['draft', 'active', 'amended', 'expired', 'terminated'],
      default: 'draft',
      index: true,
    },
    amendments: { type: [amendmentSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
legalAgreementSchema.plugin(approvalWorkflowPlugin);

const permitLicenseSchema = new Schema(
  {
    permitNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    recordType: { type: String, enum: ['permit', 'license', 'insurance'], default: 'permit' },
    scope: { type: String, enum: ['company', 'project'], default: 'project' },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    authorityOrInsurer: { type: String, required: true, trim: true, maxlength: 160 },
    issueDate: Date,
    expiryDate: { type: Date, required: true, index: true },
    coverageAmount: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['active', 'expiring_soon', 'expired', 'renewed'], default: 'active', index: true },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

const legalDisputeSchema = new Schema(
  {
    caseNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    partyName: { type: String, required: true, trim: true, maxlength: 160 },
    disputeType: { type: String, enum: ['notice', 'claim', 'arbitration', 'litigation'], default: 'notice' },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    claimAmount: { type: Number, min: 0, default: 0 },
    filedDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['open', 'under_review', 'settled', 'closed'], default: 'open', index: true },
    summary: { type: String, trim: true, maxlength: 2000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const LegalAgreement =
  mongoose.models.LegalAgreement || mongoose.model('LegalAgreement', legalAgreementSchema);
export const PermitLicense =
  mongoose.models.PermitLicense || mongoose.model('PermitLicense', permitLicenseSchema);
export const LegalDispute =
  mongoose.models.LegalDispute || mongoose.model('LegalDispute', legalDisputeSchema);

