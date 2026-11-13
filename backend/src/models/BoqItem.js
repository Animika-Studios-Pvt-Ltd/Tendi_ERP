import mongoose from 'mongoose';

const { Schema } = mongoose;

const takeoffSchema = new Schema(
  {
    length: { type: Number, min: 0, default: 0 },
    width: { type: Number, min: 0, default: 0 },
    height: { type: Number, min: 0, default: 0 },
    multiplier: { type: Number, min: 0, default: 1 },
    formula: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: false },
);

/**
 * Bill of Quantities (BOQ) line item belonging to an Estimate (and linked to Project upon conversion).
 */
const boqItemSchema = new Schema(
  {
    estimate: { type: Schema.Types.ObjectId, ref: 'Estimate', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    itemCode: { type: String, trim: true, uppercase: true, maxlength: 30, default: '' },
    wbsCode: { type: String, trim: true, maxlength: 30, default: '' },
    workPackage: { type: String, trim: true, maxlength: 120, default: '' },
    costHead: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    unit: { type: String, required: true, trim: true, maxlength: 40 },
    takeoff: { type: takeoffSchema, default: () => ({ length: 0, width: 0, height: 0, multiplier: 1, formula: '' }) },
    quantity: { type: Number, required: true, min: 0, default: 0 },

    rateAnalysis: { type: Schema.Types.ObjectId, ref: 'RateAnalysis', default: null },
    material: { type: Schema.Types.ObjectId, ref: 'Material', default: null },

    materialRate: { type: Number, min: 0, default: 0 },
    labourRate: { type: Number, min: 0, default: 0 },
    equipmentRate: { type: Number, min: 0, default: 0 },
    subcontractorRate: { type: Number, min: 0, default: 0 },
    unitRate: { type: Number, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },

    notes: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

boqItemSchema.index({ estimate: 1, costHead: 1, wbsCode: 1 });

export const BoqItem = mongoose.models.BoqItem || mongoose.model('BoqItem', boqItemSchema);

