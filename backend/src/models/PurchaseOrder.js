import mongoose from 'mongoose';
import { approvalWorkflowPlugin } from './plugins/approvalWorkflow.js';

const { Schema } = mongoose;

const poItemSchema = new Schema(
  {
    material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    quantity: { type: Number, required: true, min: 0.01 },
    receivedQuantity: { type: Number, min: 0, default: 0 },
    unit: { type: String, required: true, trim: true, maxlength: 30 },
    unitRate: { type: Number, required: true, min: 0 },
    taxPercent: { type: Number, min: 0, max: 100, default: 18 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const purchaseOrderSchema = new Schema(
  {
    poNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    materialRequest: { type: Schema.Types.ObjectId, ref: 'MaterialRequest' },
    rfqRef: { type: Schema.Types.ObjectId, ref: 'Rfq', default: null },
    freightCharges: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    taxType: { type: String, enum: ['intra_state', 'inter_state'], default: 'intra_state' },
    poDate: { type: Date, default: Date.now },
    expectedDeliveryDate: Date,
    items: { type: [poItemSchema], required: true, validate: [(v) => v.length > 0, 'Add at least one PO item'] },
    subtotal: { type: Number, required: true, min: 0 },
    taxTotal: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    deliveryStatus: {
      type: String,
      enum: ['pending', 'partially_received', 'fully_received'],
      default: 'pending',
    },
    termsAndConditions: { type: String, trim: true, maxlength: 2000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

purchaseOrderSchema.plugin(approvalWorkflowPlugin);
purchaseOrderSchema.index({ project: 1, createdAt: -1 });

export const PurchaseOrder =
  mongoose.models.PurchaseOrder || mongoose.model('PurchaseOrder', purchaseOrderSchema);

