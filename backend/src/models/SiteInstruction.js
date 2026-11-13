import mongoose from 'mongoose';

const { Schema } = mongoose;

const siteInstructionSchema = new Schema(
  {
    siNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 180 },
    instruction: { type: String, required: true, trim: true, maxlength: 2000 },
    category: { type: String, enum: ['quality', 'safety', 'progress', 'rework', 'general'], default: 'general' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    issuedToName: { type: String, trim: true, maxlength: 120, default: '' },
    issuedToUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dueDate: Date,
    status: { type: String, enum: ['open', 'acknowledged', 'complied', 'closed'], default: 'open', index: true },
    responseNotes: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

siteInstructionSchema.index({ site: 1, createdAt: -1 });

export const SiteInstruction =
  mongoose.models.SiteInstruction || mongoose.model('SiteInstruction', siteInstructionSchema);

