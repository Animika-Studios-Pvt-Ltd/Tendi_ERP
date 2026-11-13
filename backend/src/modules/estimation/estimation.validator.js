import { z } from 'zod';
import { BID_STATUS, TENDER_STATUS, TENDER_TYPE } from '../../models/Tender.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');
const nullableId = z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null);
const text = (max) => z.string().trim().max(max);
const dateField = z
  .union([z.string().trim().min(1), z.literal(''), z.null()])
  .transform((v) => (v ? new Date(v) : null));

/* Rate Analysis */
export const idParams = z.object({ id: objectId });
export const estimateBoqParams = z.object({ id: objectId, itemId: objectId });
export const tenderBidParams = z.object({ id: objectId, bidId: objectId });

const materialComponentSchema = z.object({
  material: nullableId.optional(),
  description: z.string().trim().min(1).max(160),
  unit: text(40).optional().default('nos'),
  qtyPerUnit: z.coerce.number().min(0).default(1),
  rate: z.coerce.number().min(0).default(0),
});

const labourComponentSchema = z.object({
  trade: z.string().trim().min(1).max(100),
  unit: text(40).optional().default('days'),
  qtyPerUnit: z.coerce.number().min(0).default(1),
  rate: z.coerce.number().min(0).default(0),
});

const equipmentComponentSchema = z.object({
  equipmentName: z.string().trim().min(1).max(120),
  unit: text(40).optional().default('hours'),
  qtyPerUnit: z.coerce.number().min(0).default(1),
  rate: z.coerce.number().min(0).default(0),
});

export const listRateAnalysesQuery = z.object({
  q: text(100).optional(),
  costHead: text(100).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const createRateAnalysisSchema = z.object({
  code: z.string().trim().toUpperCase().max(30).optional(),
  name: z.string().trim().min(1, 'Enter rate analysis name').max(180),
  costHead: text(100).optional().default('General'),
  unit: z.string().trim().min(1, 'Enter unit').max(40),
  materialComponents: z.array(materialComponentSchema).optional().default([]),
  labourComponents: z.array(labourComponentSchema).optional().default([]),
  equipmentComponents: z.array(equipmentComponentSchema).optional().default([]),
  overheadPercent: z.coerce.number().min(0).max(100).optional().default(10),
  notes: text(1000).optional().default(''),
  isActive: z.boolean().optional().default(true),
});

export const updateRateAnalysisSchema = createRateAnalysisSchema.partial();

/* Estimates */
export const listEstimatesQuery = z.object({
  q: text(100).optional(),
  status: z.enum(Object.values(APPROVAL_STATUS)).optional(),
  project: objectId.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().max(60).optional(),
});

export const createEstimateSchema = z.object({
  title: z.string().trim().min(2, 'Enter estimate title').max(180),
  enquiryCode: text(60).optional().default(''),
  project: nullableId.optional(),
  client: z
    .object({
      name: text(120).optional().default(''),
      contactPerson: text(120).optional().default(''),
      phone: text(20).optional().default(''),
      email: text(120).optional().default(''),
    })
    .optional(),
  location: z
    .object({
      address: text(300).optional().default(''),
      city: text(80).optional().default(''),
      state: text(80).optional().default(''),
    })
    .optional(),
  overheadPercent: z.coerce.number().min(0).max(100).optional().default(10),
  contingencyPercent: z.coerce.number().min(0).max(100).optional().default(5),
  profitMarginPercent: z.coerce.number().min(0).max(100).optional().default(12),
  gstPercent: z.coerce.number().min(0).max(50).optional().default(18),
  proposalSummary: text(3000).optional().default(''),
  validityDays: z.coerce.number().int().min(1).max(365).optional().default(30),
  paymentTerms: text(1000).optional().default('30 days progressive milestone billing'),
  assumptions: text(2000).optional().default(''),
  exclusions: text(2000).optional().default(''),
});

export const updateEstimateSchema = createEstimateSchema.partial();

export const reviseEstimateSchema = z.object({
  revisionNotes: text(1000).optional().default(''),
});

export const transitionEstimateSchema = z.object({
  status: z.enum(Object.values(APPROVAL_STATUS)),
  comment: text(500).optional().default(''),
});

export const convertEstimateSchema = z.object({
  existingProjectId: nullableId.optional(),
  projectName: text(120).optional(),
  projectManager: nullableId.optional(),
  startDate: dateField.optional(),
  plannedEndDate: dateField.optional(),
  freezeBaseline: z.boolean().optional().default(true),
  createWbsTasks: z.boolean().optional().default(true),
});

/* BOQ Items */
const takeoffInputSchema = z.object({
  length: z.coerce.number().min(0).optional().default(0),
  width: z.coerce.number().min(0).optional().default(0),
  height: z.coerce.number().min(0).optional().default(0),
  multiplier: z.coerce.number().min(0).optional().default(1),
  formula: text(200).optional().default(''),
});

export const createBoqItemSchema = z.object({
  itemCode: text(30).optional().default(''),
  wbsCode: text(30).optional().default(''),
  workPackage: text(120).optional().default(''),
  costHead: z.string().trim().min(1, 'Select cost head').max(100),
  description: z.string().trim().min(1, 'Enter work description').max(500),
  unit: z.string().trim().min(1, 'Select unit').max(40),
  takeoff: takeoffInputSchema.optional(),
  quantity: z.coerce.number().min(0).optional(),
  rateAnalysis: nullableId.optional(),
  material: nullableId.optional(),
  materialRate: z.coerce.number().min(0).optional(),
  labourRate: z.coerce.number().min(0).optional(),
  equipmentRate: z.coerce.number().min(0).optional(),
  subcontractorRate: z.coerce.number().min(0).optional(),
  unitRate: z.coerce.number().min(0).optional(),
  notes: text(500).optional().default(''),
});

export const updateBoqItemSchema = createBoqItemSchema.partial();

/* Tenders & Bids */
export const listTendersQuery = z.object({
  q: text(100).optional(),
  status: z.enum(Object.values(TENDER_STATUS)).optional(),
  tenderType: z.enum(Object.values(TENDER_TYPE)).optional(),
  estimate: objectId.optional(),
  project: objectId.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const createTenderSchema = z.object({
  title: z.string().trim().min(2, 'Enter tender title').max(180),
  estimate: nullableId.optional(),
  project: nullableId.optional(),
  tenderType: z.enum(Object.values(TENDER_TYPE)).optional().default(TENDER_TYPE.SUBCONTRACTOR_PACKAGE),
  submissionDeadline: dateField.optional(),
  estimatedValue: z.coerce.number().min(0).optional().default(0),
  scopeSummary: text(2000).optional().default(''),
});

export const updateTenderSchema = createTenderSchema.partial().extend({
  status: z.enum(Object.values(TENDER_STATUS)).optional(),
});

export const createBidSchema = z.object({
  bidderName: z.string().trim().min(1, 'Enter bidder name').max(160),
  vendorRef: nullableId.optional(),
  quotedAmount: z.coerce.number().min(0, 'Enter quoted amount'),
  technicalScore: z.coerce.number().min(0).max(100).optional().default(70),
  completionDays: z.coerce.number().int().min(1).max(3650).optional().default(90),
  validityDays: z.coerce.number().int().min(1).max(365).optional().default(30),
  status: z.enum(Object.values(BID_STATUS)).optional().default(BID_STATUS.SUBMITTED),
  remarks: text(1000).optional().default(''),
});

export const awardTenderSchema = z.object({
  bidId: objectId,
  comment: text(1000).optional().default(''),
});
