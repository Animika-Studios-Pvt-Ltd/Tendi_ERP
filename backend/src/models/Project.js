import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PROJECT_STATUS = Object.freeze({
  PLANNING: 'planning',
  ACTIVE: 'active',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

/**
 * A construction project. Team membership is not stored here: user.assignedProjects is
 * the single source of truth used by every module's data scope (utils/scope.js).
 */
const projectSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Use 2-20 letters, numbers or dashes'],
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: Object.values(PROJECT_STATUS), default: PROJECT_STATUS.PLANNING, index: true },

    client: {
      name: { type: String, trim: true, maxlength: 120, default: '' },
      contactPerson: { type: String, trim: true, maxlength: 120, default: '' },
      phone: { type: String, trim: true, maxlength: 20, default: '' },
    },
    location: {
      address: { type: String, trim: true, maxlength: 300, default: '' },
      city: { type: String, trim: true, maxlength: 80, default: '' },
      state: { type: String, trim: true, maxlength: 80, default: '' },
      pincode: { type: String, trim: true, maxlength: 10, default: '' },
    },

    // Rupees. Kept as a plain number; cost modules will hold their own ledgers.
    contractValue: { type: Number, min: 0, default: 0 },
    startDate: Date,
    plannedEndDate: Date,
    actualEndDate: Date,
    progressPercent: { type: Number, min: 0, max: 100, default: 0 },

    baseline: {
      startDate: Date,
      plannedEndDate: Date,
      contractValue: { type: Number, min: 0 },
      progressPercent: { type: Number, min: 0, max: 100 },
      lockedAt: Date,
      lockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      notes: { type: String, trim: true, maxlength: 500, default: '' },
    },

    closureChecklist: {
      finalInspectionCompleted: { type: Boolean, default: false },
      punchListCleared: { type: Boolean, default: false },
      asBuiltSubmitted: { type: Boolean, default: false },
      finalAccountsSettled: { type: Boolean, default: false },
      clientHandoverCompleted: { type: Boolean, default: false },
      warrantyMonths: { type: Number, min: 0, max: 120, default: 12 },
      remarks: { type: String, trim: true, maxlength: 1000, default: '' },
      closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      closedAt: Date,
    },

    projectManager: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    estimateRef: { type: Schema.Types.ObjectId, ref: 'Estimate', index: true },
    clientRef: { type: Schema.Types.ObjectId, ref: 'Client', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

projectSchema.index({ createdAt: -1 });

export const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);
