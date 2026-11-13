import mongoose from 'mongoose';
import { approvalWorkflowPlugin } from './plugins/approvalWorkflow.js';

const { Schema } = mongoose;

const warehouseSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: ['central', 'site_store'], default: 'site_store' },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    location: { type: String, trim: true, maxlength: 200, default: '' },
    storekeeper: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const verificationLineSchema = new Schema(
  {
    material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    systemQty: { type: Number, required: true, default: 0 },
    physicalQty: { type: Number, required: true, min: 0 },
    variance: { type: Number, required: true, default: 0 },
    unitRate: { type: Number, min: 0, default: 0 },
    reason: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false },
);

const stockVerificationSchema = new Schema(
  {
    verificationNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    verificationDate: { type: Date, default: Date.now },
    items: { type: [verificationLineSchema], default: [] },
    remarks: { type: String, trim: true, maxlength: 1000, default: '' },
    adjustmentsPosted: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
stockVerificationSchema.plugin(approvalWorkflowPlugin);

export const Warehouse = mongoose.models.Warehouse || mongoose.model('Warehouse', warehouseSchema);
export const StockVerification =
  mongoose.models.StockVerification || mongoose.model('StockVerification', stockVerificationSchema);

