import mongoose from 'mongoose';

const { Schema } = mongoose;

export const TRANSACTION_TYPES = Object.freeze({
  OPENING: 'opening',
  RECEIPT: 'receipt',
  ISSUE: 'issue',
  RETURN: 'return',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
  ADJUSTMENT: 'adjustment',
});

const inventoryTransactionSchema = new Schema(
  {
    transactionNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', index: true },
    material: { type: Schema.Types.ObjectId, ref: 'Material', required: true, index: true },
    type: {
      type: String,
      enum: Object.values(TRANSACTION_TYPES),
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    delta: { type: Number, required: true },
    unitRate: { type: Number, min: 0, default: 0 },
    totalValue: { type: Number, min: 0, default: 0 },
    referenceType: {
      type: String,
      enum: ['Manual', 'GoodsReceipt', 'DailyProgressReport', 'InterSiteTransfer', 'OpeningBalance'],
      default: 'Manual',
    },
    referenceId: { type: Schema.Types.ObjectId },
    referenceNumber: { type: String, trim: true, default: '' },
    transactionDate: { type: Date, default: Date.now, index: true },
    issuedTo: { type: String, trim: true, maxlength: 120, default: '' },
    remarks: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

inventoryTransactionSchema.index({ project: 1, material: 1, transactionDate: -1 });

export const InventoryTransaction =
  mongoose.models.InventoryTransaction || mongoose.model('InventoryTransaction', inventoryTransactionSchema);

