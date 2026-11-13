import mongoose from 'mongoose';
import { approvalWorkflowPlugin } from './plugins/approvalWorkflow.js';

const { Schema } = mongoose;

const rfiSchema = new Schema(
  {
    rfiNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    drawingRef: { type: Schema.Types.ObjectId, ref: 'Drawing', default: null },
    subject: { type: String, required: true, trim: true, maxlength: 180 },
    question: { type: String, required: true, trim: true, maxlength: 2000 },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dueDate: Date,
    response: { type: String, trim: true, maxlength: 2000, default: '' },
    respondedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    respondedAt: Date,
    status: { type: String, enum: ['open', 'answered', 'closed'], default: 'open', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const submittalSchema = new Schema(
  {
    submittalNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    type: { type: String, enum: ['material', 'technical', 'shop_drawing', 'sample'], default: 'material' },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    specificationRef: { type: String, trim: true, maxlength: 120, default: '' },
    documentRef: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    remarks: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
submittalSchema.plugin(approvalWorkflowPlugin);

const transmittalSchema = new Schema(
  {
    transmittalNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    recipientType: { type: String, enum: ['client', 'consultant', 'contractor', 'authority'], default: 'client' },
    recipientName: { type: String, required: true, trim: true, maxlength: 150 },
    subject: { type: String, required: true, trim: true, maxlength: 180 },
    documentIds: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
    drawingIds: [{ type: Schema.Types.ObjectId, ref: 'Drawing' }],
    sentAt: { type: Date, default: Date.now },
    remarks: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const Rfi = mongoose.models.Rfi || mongoose.model('Rfi', rfiSchema);
export const Submittal = mongoose.models.Submittal || mongoose.model('Submittal', submittalSchema);
export const Transmittal = mongoose.models.Transmittal || mongoose.model('Transmittal', transmittalSchema);

