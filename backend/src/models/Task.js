import mongoose from 'mongoose';

const { Schema } = mongoose;

export const TASK_STATUS = Object.freeze({
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  UNDER_REVIEW: 'under_review',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
});

export const TASK_PRIORITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const taskSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    milestone: { type: Schema.Types.ObjectId, ref: 'Milestone', index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    status: {
      type: String,
      enum: Object.values(TASK_STATUS),
      default: TASK_STATUS.TODO,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(TASK_PRIORITY),
      default: TASK_PRIORITY.MEDIUM,
      index: true,
    },
    startDate: Date,
    dueDate: Date,
    completedAt: Date,
    progressPercent: { type: Number, min: 0, max: 100, default: 0 },
    dependencies: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ project: 1, dueDate: 1 });

export const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);

