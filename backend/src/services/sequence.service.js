import { CompanySettings } from '../models/CompanySettings.js';
import { SequenceCounter } from '../models/SequenceCounter.js';

const DEFAULT_FALLBACKS = {
  project: { prefix: 'PRJ', nextNumber: 1, padding: 3 },
  site: { prefix: 'SITE', nextNumber: 1, padding: 3 },
  dpr: { prefix: 'DPR', nextNumber: 1, padding: 3 },
  materialRequest: { prefix: 'MR', nextNumber: 1, padding: 4 },
  purchaseOrder: { prefix: 'PO', nextNumber: 1, padding: 4 },
  goodsReceipt: { prefix: 'GRN', nextNumber: 1, padding: 4 },
  expense: { prefix: 'EXP', nextNumber: 1, padding: 4 },
  invoice: { prefix: 'INV', nextNumber: 1, padding: 4 },
  inventoryTx: { prefix: 'INVTX', nextNumber: 1, padding: 4 },
  task: { prefix: 'TSK', nextNumber: 1, padding: 3 },
  risk: { prefix: 'RSK', nextNumber: 1, padding: 3 },
  changeOrder: { prefix: 'CO', nextNumber: 1, padding: 3 },
  estimate: { prefix: 'EST', nextNumber: 1, padding: 3 },
  rateAnalysis: { prefix: 'RA', nextNumber: 1, padding: 3 },
  tender: { prefix: 'TND', nextNumber: 1, padding: 3 },
  siteInstruction: { prefix: 'SI', nextNumber: 1, padding: 3 },
  stockVerification: { prefix: 'STKV', nextNumber: 1, padding: 3 },
  rfq: { prefix: 'RFQ', nextNumber: 1, padding: 3 },
  purchaseReturn: { prefix: 'PRN', nextNumber: 1, padding: 3 },
  payment: { prefix: 'PAY', nextNumber: 1, padding: 4 },
  employee: { prefix: 'EMP', nextNumber: 1, padding: 4 },
  payrollRun: { prefix: 'PAYR', nextNumber: 1, padding: 3 },
  contractor: { prefix: 'CON', nextNumber: 1, padding: 3 },
  workOrder: { prefix: 'WO', nextNumber: 1, padding: 3 },
  contractorBill: { prefix: 'RAB', nextNumber: 1, padding: 3 },
  equipment: { prefix: 'EQP', nextNumber: 1, padding: 3 },
  client: { prefix: 'CLN', nextNumber: 1, padding: 3 },
  enquiry: { prefix: 'ENQ', nextNumber: 1, padding: 3 },
  complaint: { prefix: 'CMP', nextNumber: 1, padding: 3 },
  inspection: { prefix: 'QIN', nextNumber: 1, padding: 3 },
  ncr: { prefix: 'NCR', nextNumber: 1, padding: 3 },
  incident: { prefix: 'SAF', nextNumber: 1, padding: 3 },
  document: { prefix: 'DOC', nextNumber: 1, padding: 4 },
  drawing: { prefix: 'DRW', nextNumber: 1, padding: 3 },
  rfi: { prefix: 'RFI', nextNumber: 1, padding: 3 },
  submittal: { prefix: 'SUB', nextNumber: 1, padding: 3 },
  transmittal: { prefix: 'TRN', nextNumber: 1, padding: 3 },
  agreement: { prefix: 'AGR', nextNumber: 1, padding: 3 },
  dispute: { prefix: 'DSP', nextNumber: 1, padding: 3 },
};

/**
 * Generates an atomic, race-free document number backed by CompanySettings.numberingSeries
 * and SequenceCounter.
 *
 * Examples:
 *  - nextSequenceNumber('purchaseOrder', { contextCode: 'PRJ-001' }) => "PO-PRJ-001-0001"
 *  - nextSequenceNumber('dpr', { scopeKey: `${project._id}:${dateStr}`, contextCode: `${project.code}-${dateStr}` })
 */
export async function nextSequenceNumber(seriesKey, { scopeKey, contextCode, prefixOverride, minPadding } = {}) {
  const settings = await CompanySettings.getSettings();
  const series = settings?.numberingSeries?.[seriesKey] ?? DEFAULT_FALLBACKS[seriesKey] ?? {
    prefix: seriesKey.toUpperCase().slice(0, 8),
    nextNumber: 1,
    padding: 4,
  };

  const prefix = prefixOverride || series.prefix;
  const padding = minPadding ?? series.padding ?? 4;
  const startAt = Math.max(1, Number(series.nextNumber) || 1);
  const counterKey = scopeKey ? `${seriesKey}:${scopeKey}` : seriesKey;

  // Ensure the counter is seeded at least at (startAt - 1) if newly initialized,
  // or respect settings.nextNumber when settings was bumped higher than existing counter.
  const existing = await SequenceCounter.findOne({ key: counterKey }).lean();
  if (!existing) {
    try {
      await SequenceCounter.create({ key: counterKey, seq: startAt - 1 });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  } else if (!scopeKey && existing.seq < startAt - 1) {
    await SequenceCounter.updateOne(
      { key: counterKey, seq: { $lt: startAt - 1 } },
      { $set: { seq: startAt - 1 } },
    );
  }

  const counter = await SequenceCounter.findOneAndUpdate(
    { key: counterKey },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true },
  );

  const padded = String(counter.seq).padStart(padding, '0');
  return contextCode ? `${prefix}-${contextCode}-${padded}` : `${prefix}-${padded}`;
}
