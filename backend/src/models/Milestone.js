import mongoose from 'mongoose';

const { Schema } = mongoose;

export const MILESTONE_STATUS = Object.freeze({
  PENDING: 'pending',
  ACHIEVED: 'achieved',
  DELAYED: 'delayed',
});

const milestoneSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    targetDate: { type: Date, required: true },
    actualDate: Date,
    status: {
      type: String,
      enum: Object.values(MILESTONE_STATUS),
      default: MILESTONE_STATUS.PENDING,
      index: true,
    },
    deliverables: { type: [String], default: [] },
    progressPercent: { type: Number, min: 0, max: 100, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

milestoneSchema.index({ project: 1, targetDate: 1 });

export const Milestone = mongoose.models.Milestone || mongoose.model('Milestone', milestoneSchema);

