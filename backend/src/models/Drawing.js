import mongoose from 'mongoose';

const { Schema } = mongoose;

export const DRAWING_DISCIPLINE = Object.freeze({
  ARCHITECTURAL: 'architectural',
  STRUCTURAL: 'structural',
  MEP: 'mep',
  CIVIL: 'civil',
  LANDSCAPE: 'landscape',
});

export const REVISION_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  OBSOLETE: 'obsolete',
  REJECTED: 'rejected',
});

const revisionSchema = new Schema(
  {
    revCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    externalUrl: { type: String, trim: true, maxlength: 500, default: '' },
    documentRef: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    status: { type: String, enum: Object.values(REVISION_STATUS), default: REVISION_STATUS.DRAFT },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    supersededAt: Date,
  },
  { timestamps: true },
);

const drawingSchema = new Schema(
  {
    drawingNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    discipline: { type: String, enum: Object.values(DRAWING_DISCIPLINE), default: DRAWING_DISCIPLINE.STRUCTURAL },
    scale: { type: String, trim: true, maxlength: 30, default: '1:100' },
    currentRevisionCode: { type: String, trim: true, uppercase: true, default: '' },
    revisions: { type: [revisionSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const Drawing = mongoose.models.Drawing || mongoose.model('Drawing', drawingSchema);

