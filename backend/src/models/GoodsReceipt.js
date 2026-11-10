import mongoose from 'mongoose';

const { Schema } = mongoose;

const grnItemSchema = new Schema(
  {
    material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    receivedQuantity: { type: Number, required: true, min: 0.01 },
    unit: { type: String, required: true, trim: true, maxlength: 30 },
    unitRate: { type: Number, min: 0, default: 0 },
    remarks: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false },
);

const goodsReceiptSchema = new Schema(
  {
    grnNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site' },
    purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true, index: true },
    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true },
    receivedDate: { type: Date, default: Date.now, index: true },
    challanNumber: { type: String, trim: true, maxlength: 80, default: '' },
    items: { type: [grnItemSchema], required: true, validate: [(v) => v.length > 0, 'Receive at least one item'] },
    remarks: { type: String, trim: true, maxlength: 1000, default: '' },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

goodsReceiptSchema.index({ project: 1, receivedDate: -1 });

export const GoodsReceipt = mongoose.models.GoodsReceipt || mongoose.model('GoodsReceipt', goodsReceiptSchema);

