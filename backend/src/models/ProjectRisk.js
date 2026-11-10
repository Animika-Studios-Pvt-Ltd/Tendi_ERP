import mongoose from 'mongoose';

const { Schema } = mongoose;

export const RISK_CATEGORY = Object.freeze({
  TECHNICAL: 'technical',
  SCHEDULE: 'schedule',
  FINANCIAL: 'financial',
  SAFETY: 'safety',
  REGULATORY: 'regulatory',
  SUPPLY_CHAIN: 'supply_chain',
  WEATHER: 'weather',
  OTHER: 'other',
});

export const RISK_LEVEL = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

export const RISK_STATUS = Object.freeze({
  OPEN: 'open',
  MITIGATED: 'mitigated',
  OCCURRED: 'occurred',
  CLOSED: 'closed',
});

const SEVERITY_MATRIX = {
  low: { low: 'low', medium: 'low', high: 'medium' },
  medium: { low: 'low', medium: 'medium', high: 'high' },
  high: { low: 'medium', medium: 'high', high: 'critical' },
};

export function computeRiskSeverity(probability = 'medium', impact = 'medium') {
  return SEVERITY_MATRIX[probability]?.[impact] ?? 'medium';
}

const projectRiskSchema = new Schema(
  {
    riskNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    category: {
      type: String,
      enum: Object.values(RISK_CATEGORY),
      default: RISK_CATEGORY.TECHNICAL,
      index: true,
    },
    probability: { type: String, enum: Object.values(RISK_LEVEL), default: RISK_LEVEL.MEDIUM },
    impact: { type: String, enum: Object.values(RISK_LEVEL), default: RISK_LEVEL.MEDIUM },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium', index: true },
    mitigationPlan: { type: String, trim: true, maxlength: 2000, default: '' },
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
    dueDate: Date,
    status: { type: String, enum: Object.values(RISK_STATUS), default: RISK_STATUS.OPEN, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

projectRiskSchema.index({ project: 1, status: 1 });

export const ProjectRisk =
  mongoose.models.ProjectRisk || mongoose.model('ProjectRisk', projectRiskSchema);

