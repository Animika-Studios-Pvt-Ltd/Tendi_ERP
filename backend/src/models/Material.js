import mongoose from 'mongoose';

const { Schema } = mongoose;

const materialSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Material code must be 2-20 uppercase letters, numbers or dashes'],
    },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    category: { type: String, required: true, trim: true, maxlength: 80, index: true },
    unit: { type: String, required: true, trim: true, maxlength: 30 },
    hsnCode: { type: String, trim: true, maxlength: 20, default: '' },
    barcode: { type: String, trim: true, uppercase: true, sparse: true, unique: true },
    gstPercent: { type: Number, min: 0, max: 50, default: 18 },
    standardRate: { type: Number, min: 0, default: 0 },
    reorderLevel: { type: Number, min: 0, default: 10 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

materialSchema.index({ name: 'text', code: 'text', category: 'text' });

export const Material = mongoose.models.Material || mongoose.model('Material', materialSchema);

