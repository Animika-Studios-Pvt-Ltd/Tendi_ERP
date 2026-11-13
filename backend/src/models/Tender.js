import mongoose from 'mongoose';

const { Schema } = mongoose;

export const TENDER_TYPE = Object.freeze({
  CLIENT_BID: 'client_bid',
  SUBCONTRACTOR_PACKAGE: 'subcontractor_package',
  MATERIAL_PACKAGE: 'material_package',
});

export const TENDER_STATUS = Object.freeze({
  OPEN: 'open',
  EVALUATION: 'evaluation',
  AWARDED: 'awarded',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
});

export const BID_STATUS = Object.freeze({
  SUBMITTED: 'submitted',
  SHORTLISTED: 'shortlisted',
  AWARDED: 'awarded',
  REJECTED: 'rejected',
});

const bidSchema = new Schema(
  {
    bidderName: { type: String, required: true, trim: true, maxlength: 160 },
    vendorRef: { type: Schema.Types.ObjectId, ref: 'Vendor', default: null },
    submittedAt: { type: Date, default: Date.now },
    quotedAmount: { type: Number, required: true, min: 0 },
    technicalScore: { type: Number, min: 0, max: 100, default: 0 },
    completionDays: { type: Number, min: 1, max: 3650, default: 90 },
    validityDays: { type: Number, min: 1, max: 365, default: 30 },
    status: { type: String, enum: Object.values(BID_STATUS), default: BID_STATUS.SUBMITTED },
    remarks: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true },
);

const tenderSchema = new Schema(
  {
    tenderNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    estimate: { type: Schema.Types.ObjectId, ref: 'Estimate', default: null, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    tenderType: { type: String, enum: Object.values(TENDER_TYPE), default: TENDER_TYPE.SUBCONTRACTOR_PACKAGE },
    submissionDeadline: Date,
    estimatedValue: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: Object.values(TENDER_STATUS), default: TENDER_STATUS.OPEN, index: true },
    scopeSummary: { type: String, trim: true, maxlength: 2000, default: '' },
    bids: { type: [bidSchema], default: [] },
    awardedBidId: { type: Schema.Types.ObjectId, default: null },
    awardedAt: Date,
    awardedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    awardComment: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

tenderSchema.index({ createdAt: -1 });

export const Tender = mongoose.models.Tender || mongoose.model('Tender', tenderSchema);

