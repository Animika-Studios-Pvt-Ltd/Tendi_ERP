import mongoose from 'mongoose';

const { Schema } = mongoose;

const materialComponentSchema = new Schema(
  {
    material: { type: Schema.Types.ObjectId, ref: 'Material' },
    description: { type: String, required: true, trim: true, maxlength: 160 },
    unit: { type: String, trim: true, maxlength: 40, default: 'nos' },
    qtyPerUnit: { type: Number, required: true, min: 0, default: 1 },
    rate: { type: Number, required: true, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const labourComponentSchema = new Schema(
  {
    trade: { type: String, required: true, trim: true, maxlength: 100 },
    unit: { type: String, trim: true, maxlength: 40, default: 'days' },
    qtyPerUnit: { type: Number, required: true, min: 0, default: 1 },
    rate: { type: Number, required: true, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const equipmentComponentSchema = new Schema(
  {
    equipmentName: { type: String, required: true, trim: true, maxlength: 120 },
    unit: { type: String, trim: true, maxlength: 40, default: 'hours' },
    qtyPerUnit: { type: Number, required: true, min: 0, default: 1 },
    rate: { type: Number, required: true, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

/**
 * Reusable composite rate breakdown template combining material, labour, equipment,
 * and standard overhead for 1 unit of BOQ work.
 */
const rateAnalysisSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 30 },
    name: { type: String, required: true, trim: true, maxlength: 180 },
    costHead: { type: String, trim: true, maxlength: 100, default: 'General' },
    unit: { type: String, required: true, trim: true, maxlength: 40 },
    materialComponents: { type: [materialComponentSchema], default: [] },
    labourComponents: { type: [labourComponentSchema], default: [] },
    equipmentComponents: { type: [equipmentComponentSchema], default: [] },
    materialUnitCost: { type: Number, min: 0, default: 0 },
    labourUnitCost: { type: Number, min: 0, default: 0 },
    equipmentUnitCost: { type: Number, min: 0, default: 0 },
    directRate: { type: Number, min: 0, default: 0 },
    overheadPercent: { type: Number, min: 0, max: 100, default: 10 },
    compositeRate: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

rateAnalysisSchema.index({ name: 'text', code: 'text', costHead: 'text' });

export const RateAnalysis =
  mongoose.models.RateAnalysis || mongoose.model('RateAnalysis', rateAnalysisSchema);

