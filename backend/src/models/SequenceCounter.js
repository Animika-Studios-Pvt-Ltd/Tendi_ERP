import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Atomic document sequence counters synced with CompanySettings.numberingSeries.
 * Keys look like "purchaseOrder" or "dpr:PRJ-001:20261110".
 */
const sequenceCounterSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    seq: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

export const SequenceCounter =
  mongoose.models.SequenceCounter || mongoose.model('SequenceCounter', sequenceCounterSchema);

