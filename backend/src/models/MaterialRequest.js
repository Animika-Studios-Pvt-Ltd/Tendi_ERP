import mongoose from 'mongoose';
import { approvalWorkflowPlugin } from './plugins/approvalWorkflow.js';

const { Schema } = mongoose;

const mrItemSchema = new Schema(
  {
    material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    quantity: { type: Number, required: true, min: 0.01 },
    unit: { type: String, required: true, trim: true, maxlength: 30 },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false },
);

const materialRequestSchema = new Schema(
  {
    requestNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site' },
    requiredByDate: { type: Date, required: true },
    priority: { type: String, enum: ['normal', 'urgent', 'critical'], default: 'normal' },
    items: { type: [mrItemSchema], required: true, validate: [(v) => v.length > 0, 'Add at least one item'] },
    remarks: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

materialRequestSchema.plugin(approvalWorkflowPlugin);
materialRequestSchema.index({ project: 1, createdAt: -1 });

export const MaterialRequest =
  mongoose.models.MaterialRequest || mongoose.model('MaterialRequest', materialRequestSchema);

