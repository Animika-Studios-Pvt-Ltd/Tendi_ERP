import mongoose from 'mongoose';
import { approvalWorkflowPlugin } from './plugins/approvalWorkflow.js';

const { Schema } = mongoose;

const estimateSchema = new Schema(
  {
    estimateNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    version: { type: Number, min: 1, default: 1 },
    parentEstimate: { type: Schema.Types.ObjectId, ref: 'Estimate', default: null },
    revisionNotes: { type: String, trim: true, maxlength: 1000, default: '' },

    enquiryCode: { type: String, trim: true, maxlength: 60, default: '' },
    client: {
      name: { type: String, trim: true, maxlength: 120, default: '' },
      contactPerson: { type: String, trim: true, maxlength: 120, default: '' },
      phone: { type: String, trim: true, maxlength: 20, default: '' },
      email: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
    },
    location: {
      address: { type: String, trim: true, maxlength: 300, default: '' },
      city: { type: String, trim: true, maxlength: 80, default: '' },
      state: { type: String, trim: true, maxlength: 80, default: '' },
    },

    // Optional project association (or filled when converted to a Project)
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },

    // Rollups computed from BoqItem rows belonging to this estimate
    boqSummary: {
      itemCount: { type: Number, min: 0, default: 0 },
      materialTotal: { type: Number, min: 0, default: 0 },
      labourTotal: { type: Number, min: 0, default: 0 },
      equipmentTotal: { type: Number, min: 0, default: 0 },
      subcontractorTotal: { type: Number, min: 0, default: 0 },
      directCost: { type: Number, min: 0, default: 0 },
    },

    // Commercial markup & tax percentages
    overheadPercent: { type: Number, min: 0, max: 100, default: 10 },
    contingencyPercent: { type: Number, min: 0, max: 100, default: 5 },
    profitMarginPercent: { type: Number, min: 0, max: 100, default: 12 },
    gstPercent: { type: Number, min: 0, max: 50, default: 18 },

    overheadAmount: { type: Number, min: 0, default: 0 },
    contingencyAmount: { type: Number, min: 0, default: 0 },
    marginAmount: { type: Number, min: 0, default: 0 },
    subTotalBeforeTax: { type: Number, min: 0, default: 0 },
    taxAmount: { type: Number, min: 0, default: 0 },
    quotedTotal: { type: Number, min: 0, default: 0 },

    // Commercial proposal clauses
    proposalSummary: { type: String, trim: true, maxlength: 3000, default: '' },
    validityDays: { type: Number, min: 1, max: 365, default: 30 },
    paymentTerms: { type: String, trim: true, maxlength: 1000, default: '30 days progressive milestone billing' },
    assumptions: { type: String, trim: true, maxlength: 2000, default: '' },
    exclusions: { type: String, trim: true, maxlength: 2000, default: '' },

    convertedProject: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    convertedAt: Date,
    convertedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

estimateSchema.plugin(approvalWorkflowPlugin);
estimateSchema.index({ createdAt: -1 });
estimateSchema.index({ parentEstimate: 1, version: -1 });

export const Estimate = mongoose.models.Estimate || mongoose.model('Estimate', estimateSchema);

