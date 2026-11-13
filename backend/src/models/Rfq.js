import mongoose from 'mongoose';

const { Schema } = mongoose;

const rfqItemSchema = new Schema(
  {
    material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    quantity: { type: Number, required: true, min: 0.001 },
    unit: { type: String, required: true, trim: true, maxlength: 30 },
    notes: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: false },
);

const quoteItemSchema = new Schema(
  {
    material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    unitRate: { type: Number, required: true, min: 0 },
    taxPercent: { type: Number, min: 0, max: 100, default: 18 },
    lineTotal: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const quotationSchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true },
    items: { type: [quoteItemSchema], default: [] },
    quotedTotal: { type: Number, min: 0, default: 0 },
    deliveryDays: { type: Number, min: 1, max: 365, default: 7 },
    validityDays: { type: Number, min: 1, max: 365, default: 30 },
    remarks: { type: String, trim: true, maxlength: 500, default: '' },
    isAwarded: { type: Boolean, default: false },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

const rfqSchema = new Schema(
  {
    rfqNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    materialRequest: { type: Schema.Types.ObjectId, ref: 'MaterialRequest', default: null },
    vendors: [{ type: Schema.Types.ObjectId, ref: 'Vendor' }],
    items: { type: [rfqItemSchema], default: [] },
    quotations: { type: [quotationSchema], default: [] },
    dueDate: Date,
    status: { type: String, enum: ['open', 'evaluation', 'awarded', 'closed', 'cancelled'], default: 'open', index: true },
    awardedVendor: { type: Schema.Types.ObjectId, ref: 'Vendor', default: null },
    generatedPo: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const returnLineSchema = new Schema(
  {
    material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    returnedQuantity: { type: Number, required: true, min: 0.001 },
    unit: { type: String, trim: true, maxlength: 30 },
    unitRate: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, min: 0, default: 0 },
    reason: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false },
);

const purchaseReturnSchema = new Schema(
  {
    returnNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    goodsReceipt: { type: Schema.Types.ObjectId, ref: 'GoodsReceipt', default: null },
    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true },
    returnDate: { type: Date, default: Date.now },
    reason: { type: String, trim: true, maxlength: 500, default: '' },
    items: { type: [returnLineSchema], default: [] },
    totalAmount: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['pending_credit', 'credited', 'settled'], default: 'pending_credit' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const Rfq = mongoose.models.Rfq || mongoose.model('Rfq', rfqSchema);
export const PurchaseReturn =
  mongoose.models.PurchaseReturn || mongoose.model('PurchaseReturn', purchaseReturnSchema);

