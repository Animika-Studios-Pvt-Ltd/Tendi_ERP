import mongoose from 'mongoose';

const { Schema } = mongoose;

export const SITE_STATUS = Object.freeze({
  ACTIVE: 'active',
  PLANNING: 'planning',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
});

const siteSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Site code must be 2-20 uppercase letters, numbers or dashes'],
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    description: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: Object.values(SITE_STATUS), default: SITE_STATUS.ACTIVE, index: true },
    location: {
      address: { type: String, trim: true, maxlength: 300, default: '' },
      city: { type: String, trim: true, maxlength: 80, default: '' },
      state: { type: String, trim: true, maxlength: 80, default: '' },
      pincode: { type: String, trim: true, maxlength: 10, default: '' },
    },
    siteEngineer: { type: Schema.Types.ObjectId, ref: 'User' },
    startDate: Date,
    targetCompletionDate: Date,
    actualCompletionDate: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

siteSchema.index({ project: 1, status: 1 });
siteSchema.index({ name: 'text', code: 'text' });

export const Site = mongoose.models.Site || mongoose.model('Site', siteSchema);

