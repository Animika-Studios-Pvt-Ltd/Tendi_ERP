import mongoose from 'mongoose';
import { approvalWorkflowPlugin } from './plugins/approvalWorkflow.js';

const { Schema } = mongoose;

export const DOCUMENT_CATEGORIES = Object.freeze({
  DRAWING: 'drawing',
  CONTRACT: 'contract',
  PERMIT: 'permit',
  SPECIFICATION: 'specification',
  REPORT: 'report',
  PHOTO: 'photo',
  OTHER: 'other',
});

export const DOCUMENT_VISIBILITY = Object.freeze({
  INTERNAL: 'internal',
  CONTRACTOR: 'contractor',
  CLIENT: 'client',
  ALL: 'all',
});

const storageSchema = new Schema(
  {
    provider: String,
    key: String,
    resourceType: String,
    deliveryType: String,
    format: String,
    mimeType: String,
    size: Number,
    originalName: String,
    scanStatus: String,
  },
  { _id: false },
);

const versionSchema = new Schema(
  {
    versionNo: { type: Number, required: true, min: 1 },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    storage: storageSchema,
    externalUrl: { type: String, trim: true, maxlength: 500, default: '' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const documentSchema = new Schema(
  {
    documentNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    folder: { type: String, trim: true, maxlength: 100, default: 'General' },
    category: { type: String, enum: Object.values(DOCUMENT_CATEGORIES), default: DOCUMENT_CATEGORIES.OTHER },
    tags: [{ type: String, trim: true, maxlength: 40 }],
    currentVersion: { type: Number, min: 1, default: 1 },
    versions: { type: [versionSchema], default: [] },
    storage: storageSchema,
    externalUrl: { type: String, trim: true, maxlength: 500, default: '' },
    expiryDate: Date,
    isObsolete: { type: Boolean, default: false, index: true },
    visibility: { type: String, enum: Object.values(DOCUMENT_VISIBILITY), default: DOCUMENT_VISIBILITY.INTERNAL },
    owner: {
      contractor: { type: Schema.Types.ObjectId, ref: 'Contractor' },
      customer: { type: Schema.Types.ObjectId, ref: 'Client' },
    },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

documentSchema.plugin(approvalWorkflowPlugin);
documentSchema.index({ project: 1, folder: 1, createdAt: -1 });

export const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);

