import mongoose from 'mongoose';
import { approvalWorkflowPlugin } from './plugins/approvalWorkflow.js';

const { Schema } = mongoose;

export const CHANGE_ORDER_TYPE = Object.freeze({
  SCOPE: 'scope',
  COST: 'cost',
  SCHEDULE: 'schedule',
  COMBINED: 'combined',
});

const changeOrderSchema = new Schema(
  {
    changeNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    type: {
      type: String,
      enum: Object.values(CHANGE_ORDER_TYPE),
      default: CHANGE_ORDER_TYPE.COMBINED,
    },
    costImpact: { type: Number, default: 0 },
    scheduleImpactDays: { type: Number, default: 0 },
    reason: { type: String, trim: true, maxlength: 1000, default: '' },
    clientApprovalRequired: { type: Boolean, default: false },
    clientApproved: { type: Boolean, default: false },
    appliedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

changeOrderSchema.plugin(approvalWorkflowPlugin);
changeOrderSchema.index({ project: 1, createdAt: -1 });

export const ChangeOrder =
  mongoose.models.ChangeOrder || mongoose.model('ChangeOrder', changeOrderSchema);

