import mongoose from 'mongoose';

const { Schema } = mongoose;

const vendorSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Vendor code must be 2-20 letters, numbers or dashes'],
    },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    contactPerson: { type: String, trim: true, maxlength: 120, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    gstin: { type: String, trim: true, uppercase: true, maxlength: 20, default: '' },
    pan: { type: String, trim: true, uppercase: true, maxlength: 15, default: '' },
    categories: { type: [String], default: [] },
    address: {
      street: { type: String, trim: true, maxlength: 300, default: '' },
      city: { type: String, trim: true, maxlength: 80, default: '' },
      state: { type: String, trim: true, maxlength: 80, default: '' },
      pincode: { type: String, trim: true, maxlength: 10, default: '' },
    },
    paymentTermsDays: { type: Number, min: 0, default: 30 },
    rating: { type: Number, min: 1, max: 5, default: 4 },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

vendorSchema.index({ name: 'text', code: 'text', gstin: 'text' });

export const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', vendorSchema);

