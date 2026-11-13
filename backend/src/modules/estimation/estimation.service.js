import { ACTIONS, DATA_SCOPES, MODULES, ROLES } from '../../config/rbac.js';
import { BoqItem } from '../../models/BoqItem.js';
import { Estimate } from '../../models/Estimate.js';
import { InventoryTransaction, TRANSACTION_TYPES } from '../../models/InventoryTransaction.js';
import { Material } from '../../models/Material.js';
import { NOTIFICATION_TYPES } from '../../models/Notification.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { Project, PROJECT_STATUS } from '../../models/Project.js';
import { PurchaseOrder } from '../../models/PurchaseOrder.js';
import { RateAnalysis } from '../../models/RateAnalysis.js';
import { Role } from '../../models/Role.js';
import { Task, TASK_STATUS } from '../../models/Task.js';
import { BID_STATUS, Tender, TENDER_STATUS } from '../../models/Tender.js';
import { User, USER_STATUS } from '../../models/User.js';
import { Vendor } from '../../models/Vendor.js';
import { executeApprovalTransition } from '../../services/approval.service.js';
import { notifyProjectApprovers, notifyUsers } from '../../services/notification.service.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { paginate, parsePagination } from '../../utils/pagination.js';
import { canAccessProject } from '../../utils/scope.js';
import { toProjectDto } from '../projects/projects.service.js';

const PERSON_SELECT = 'firstName lastName email designation';
const ESTIMATE_SORT_FIELDS = ['createdAt', 'estimateNumber', 'title', 'quotedTotal', 'status', 'version'];
const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fullName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ');
const toPerson = (p) =>
  p?._id ? { id: String(p._id), fullName: fullName(p), email: p.email, designation: p.designation ?? '' } : null;

function buildEstimationScope(user, projectField = 'project') {
  if (!user?.role) return { _id: null };
  if (user.role.dataScope === DATA_SCOPES.ALL) return {};
  const assigned = user.assignedProjects ?? [];
  if (user.role.dataScope === DATA_SCOPES.OWN) {
    return { $or: [{ [projectField]: { $in: assigned } }, { createdBy: user._id }] };
  }
  return { $or: [{ [projectField]: { $in: assigned } }, { [projectField]: null }] };
}

function assertRecordAccess(user, doc) {
  if (!doc) throw ApiError.notFound('Record not found');
  if (doc.project && !canAccessProject(user, doc.project?._id || doc.project)) {
    throw ApiError.notFound('Record not found');
  }
  if (!doc.project && user.role?.dataScope === DATA_SCOPES.OWN && String(doc.createdBy?._id || doc.createdBy) !== String(user._id)) {
    throw ApiError.notFound('Record not found');
  }
}

/* =========================================================================
 * DTO MAPPERS
 * ========================================================================= */

export function toRateAnalysisDto(doc) {
  const r = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(r._id),
    code: r.code,
    name: r.name,
    costHead: r.costHead,
    unit: r.unit,
    materialComponents: r.materialComponents ?? [],
    labourComponents: r.labourComponents ?? [],
    equipmentComponents: r.equipmentComponents ?? [],
    materialUnitCost: r.materialUnitCost ?? 0,
    labourUnitCost: r.labourUnitCost ?? 0,
    equipmentUnitCost: r.equipmentUnitCost ?? 0,
    directRate: r.directRate ?? 0,
    overheadPercent: r.overheadPercent ?? 0,
    compositeRate: r.compositeRate ?? 0,
    isActive: Boolean(r.isActive),
    notes: r.notes ?? '',
    createdBy: toPerson(r.createdBy),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function toBoqItemDto(doc) {
  const b = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(b._id),
    estimate: String(b.estimate?._id || b.estimate),
    project: b.project ? String(b.project?._id || b.project) : null,
    itemCode: b.itemCode ?? '',
    wbsCode: b.wbsCode ?? '',
    workPackage: b.workPackage ?? '',
    costHead: b.costHead,
    description: b.description,
    unit: b.unit,
    takeoff: b.takeoff ?? { length: 0, width: 0, height: 0, multiplier: 1, formula: '' },
    quantity: b.quantity ?? 0,
    rateAnalysis: b.rateAnalysis?._id
      ? { id: String(b.rateAnalysis._id), code: b.rateAnalysis.code, name: b.rateAnalysis.name }
      : b.rateAnalysis
        ? String(b.rateAnalysis)
        : null,
    material: b.material?._id
      ? { id: String(b.material._id), code: b.material.code, name: b.material.name, unit: b.material.unit }
      : b.material
        ? String(b.material)
        : null,
    materialRate: b.materialRate ?? 0,
    labourRate: b.labourRate ?? 0,
    equipmentRate: b.equipmentRate ?? 0,
    subcontractorRate: b.subcontractorRate ?? 0,
    unitRate: b.unitRate ?? 0,
    amount: b.amount ?? 0,
    notes: b.notes ?? '',
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export function toEstimateDto(doc) {
  const e = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(e._id),
    estimateNumber: e.estimateNumber,
    title: e.title,
    version: e.version ?? 1,
    parentEstimate: e.parentEstimate ? String(e.parentEstimate) : null,
    revisionNotes: e.revisionNotes ?? '',
    enquiryCode: e.enquiryCode ?? '',
    client: { name: '', contactPerson: '', phone: '', email: '', ...e.client },
    location: { address: '', city: '', state: '', ...e.location },
    project: e.project?._id
      ? { id: String(e.project._id), code: e.project.code, name: e.project.name }
      : e.project
        ? String(e.project)
        : null,
    boqSummary: {
      itemCount: 0,
      materialTotal: 0,
      labourTotal: 0,
      equipmentTotal: 0,
      subcontractorTotal: 0,
      directCost: 0,
      ...e.boqSummary,
    },
    overheadPercent: e.overheadPercent ?? 0,
    contingencyPercent: e.contingencyPercent ?? 0,
    profitMarginPercent: e.profitMarginPercent ?? 0,
    gstPercent: e.gstPercent ?? 0,
    overheadAmount: e.overheadAmount ?? 0,
    contingencyAmount: e.contingencyAmount ?? 0,
    marginAmount: e.marginAmount ?? 0,
    subTotalBeforeTax: e.subTotalBeforeTax ?? 0,
    taxAmount: e.taxAmount ?? 0,
    quotedTotal: e.quotedTotal ?? 0,
    proposalSummary: e.proposalSummary ?? '',
    validityDays: e.validityDays ?? 30,
    paymentTerms: e.paymentTerms ?? '',
    assumptions: e.assumptions ?? '',
    exclusions: e.exclusions ?? '',
    convertedProject: e.convertedProject?._id
      ? { id: String(e.convertedProject._id), code: e.convertedProject.code, name: e.convertedProject.name }
      : e.convertedProject
        ? String(e.convertedProject)
        : null,
    convertedAt: e.convertedAt ?? null,
    convertedBy: toPerson(e.convertedBy),
    status: e.status,
    submittedBy: toPerson(e.submittedBy),
    submittedAt: e.submittedAt ?? null,
    decidedBy: toPerson(e.decidedBy),
    decidedAt: e.decidedAt ?? null,
    decisionComment: e.decisionComment ?? '',
    approvalHistory: (e.approvalHistory ?? []).map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      by: toPerson(h.by),
      comment: h.comment ?? '',
      at: h.at,
    })),
    createdBy: toPerson(e.createdBy),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export function toTenderDto(doc) {
  const t = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const bids = (t.bids ?? []).map((b) => ({
    id: String(b._id),
    bidderName: b.bidderName,
    vendorRef: b.vendorRef?._id
      ? { id: String(b.vendorRef._id), code: b.vendorRef.code, name: b.vendorRef.name }
      : b.vendorRef
        ? String(b.vendorRef)
        : null,
    submittedAt: b.submittedAt,
    quotedAmount: b.quotedAmount,
    technicalScore: b.technicalScore ?? 0,
    completionDays: b.completionDays ?? 90,
    validityDays: b.validityDays ?? 30,
    status: b.status,
    remarks: b.remarks ?? '',
  }));

  const quotedAmounts = bids.map((b) => b.quotedAmount);
  const lowestBidAmount = quotedAmounts.length > 0 ? Math.min(...quotedAmounts) : null;

  return {
    id: String(t._id),
    tenderNumber: t.tenderNumber,
    title: t.title,
    estimate: t.estimate?._id
      ? { id: String(t.estimate._id), estimateNumber: t.estimate.estimateNumber, title: t.estimate.title }
      : t.estimate
        ? String(t.estimate)
        : null,
    project: t.project?._id
      ? { id: String(t.project._id), code: t.project.code, name: t.project.name }
      : t.project
        ? String(t.project)
        : null,
    tenderType: t.tenderType,
    submissionDeadline: t.submissionDeadline ?? null,
    estimatedValue: t.estimatedValue ?? 0,
    status: t.status,
    scopeSummary: t.scopeSummary ?? '',
    bids,
    lowestBidAmount,
    awardedBidId: t.awardedBidId ? String(t.awardedBidId) : null,
    awardedAt: t.awardedAt ?? null,
    awardedBy: toPerson(t.awardedBy),
    awardComment: t.awardComment ?? '',
    createdBy: toPerson(t.createdBy),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/* =========================================================================
 * CALCULATION HELPERS
 * ========================================================================= */

async function normalizeRateComponents(input) {
  const materialIds = (input.materialComponents ?? []).map((c) => c.material).filter(Boolean);
  const matMap = new Map();
  if (materialIds.length > 0) {
    const mats = await Material.find({ _id: { $in: materialIds } }).select('name unit standardRate').lean();
    for (const m of mats) matMap.set(String(m._id), m);
  }

  const materialComponents = (input.materialComponents ?? []).map((c) => {
    const mat = c.material ? matMap.get(String(c.material)) : null;
    const rate = c.rate > 0 ? c.rate : (mat?.standardRate ?? 0);
    const qtyPerUnit = Number(c.qtyPerUnit) || 0;
    return {
      material: c.material || undefined,
      description: c.description || mat?.name || 'Material item',
      unit: c.unit || mat?.unit || 'nos',
      qtyPerUnit,
      rate,
      amount: round2(qtyPerUnit * rate),
    };
  });

  const labourComponents = (input.labourComponents ?? []).map((c) => {
    const qtyPerUnit = Number(c.qtyPerUnit) || 0;
    const rate = Number(c.rate) || 0;
    return { ...c, qtyPerUnit, rate, amount: round2(qtyPerUnit * rate) };
  });

  const equipmentComponents = (input.equipmentComponents ?? []).map((c) => {
    const qtyPerUnit = Number(c.qtyPerUnit) || 0;
    const rate = Number(c.rate) || 0;
    return { ...c, qtyPerUnit, rate, amount: round2(qtyPerUnit * rate) };
  });

  const materialUnitCost = round2(materialComponents.reduce((s, c) => s + c.amount, 0));
  const labourUnitCost = round2(labourComponents.reduce((s, c) => s + c.amount, 0));
  const equipmentUnitCost = round2(equipmentComponents.reduce((s, c) => s + c.amount, 0));
  const directRate = round2(materialUnitCost + labourUnitCost + equipmentUnitCost);
  const overheadPercent = Number(input.overheadPercent ?? 10);
  const compositeRate = round2(directRate * (1 + overheadPercent / 100));

  return {
    materialComponents,
    labourComponents,
    equipmentComponents,
    materialUnitCost,
    labourUnitCost,
    equipmentUnitCost,
    directRate,
    overheadPercent,
    compositeRate,
  };
}

function computeCommercialTotals(estimate, summary) {
  const directCost = round2(summary.directCost);
  const overheadAmount = round2((directCost * (estimate.overheadPercent ?? 0)) / 100);
  const contingencyAmount = round2((directCost * (estimate.contingencyPercent ?? 0)) / 100);
  const baseWithOverheads = round2(directCost + overheadAmount + contingencyAmount);
  const marginAmount = round2((baseWithOverheads * (estimate.profitMarginPercent ?? 0)) / 100);
  const subTotalBeforeTax = round2(baseWithOverheads + marginAmount);
  const taxAmount = round2((subTotalBeforeTax * (estimate.gstPercent ?? 0)) / 100);
  const quotedTotal = round2(subTotalBeforeTax + taxAmount);

  return {
    boqSummary: summary,
    overheadAmount,
    contingencyAmount,
    marginAmount,
    subTotalBeforeTax,
    taxAmount,
    quotedTotal,
  };
}

export async function recalculateEstimateTotals(estimateId) {
  const estimate = await Estimate.findById(estimateId);
  if (!estimate) return null;

  const items = await BoqItem.find({ estimate: estimate._id }).lean();
  let materialTotal = 0;
  let labourTotal = 0;
  let equipmentTotal = 0;
  let subcontractorTotal = 0;
  let directCost = 0;

  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    materialTotal += qty * (Number(item.materialRate) || 0);
    labourTotal += qty * (Number(item.labourRate) || 0);
    equipmentTotal += qty * (Number(item.equipmentRate) || 0);
    subcontractorTotal += qty * (Number(item.subcontractorRate) || 0);
    directCost += Number(item.amount) || 0;
  }

  const summary = {
    itemCount: items.length,
    materialTotal: round2(materialTotal),
    labourTotal: round2(labourTotal),
    equipmentTotal: round2(equipmentTotal),
    subcontractorTotal: round2(subcontractorTotal),
    directCost: round2(directCost),
  };

  Object.assign(estimate, computeCommercialTotals(estimate, summary));
  await estimate.save();
  return estimate;
}

function computeTakeoffQuantity(takeoff, explicitQty) {
  if (explicitQty !== undefined && explicitQty !== null && explicitQty > 0) {
    return round2(explicitQty);
  }
  if (!takeoff) return round2(explicitQty ?? 0);
  const dims = [takeoff.length, takeoff.width, takeoff.height].filter((v) => Number(v) > 0);
  if (dims.length === 0) return round2(explicitQty ?? 0);
  const base = dims.reduce((acc, v) => acc * Number(v), 1);
  const mult = Number(takeoff.multiplier) > 0 ? Number(takeoff.multiplier) : 1;
  return round2(base * mult);
}

/* =========================================================================
 * RATE ANALYSIS LIBRARY
 * ========================================================================= */

export async function listRateAnalyses(query = {}) {
  const filter = {};
  if (query.costHead) filter.costHead = query.costHead;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { costHead: rx }];
  }
  const pagination = parsePagination(query, { allowedSortFields: ['createdAt', 'code', 'name', 'compositeRate'], defaultSort: '-createdAt' });
  const { items, meta } = await paginate(RateAnalysis, filter, pagination, {
    populate: [{ path: 'createdBy', select: PERSON_SELECT }],
  });
  return { items: items.map(toRateAnalysisDto), meta };
}

export async function createRateAnalysis(user, input) {
  const code = input.code || (await nextSequenceNumber('rateAnalysis', { prefixOverride: 'RA', minPadding: 3 }));
  const computed = await normalizeRateComponents(input);
  const doc = await RateAnalysis.create({
    code: code.toUpperCase(),
    name: input.name,
    costHead: input.costHead || 'General',
    unit: input.unit,
    isActive: input.isActive ?? true,
    notes: input.notes || '',
    ...computed,
    createdBy: user._id,
    updatedBy: user._id,
  });
  await doc.populate('createdBy', PERSON_SELECT);
  return toRateAnalysisDto(doc);
}

export async function updateRateAnalysis(user, id, input) {
  const doc = await RateAnalysis.findById(id);
  if (!doc) throw ApiError.notFound('Rate analysis template not found');

  const merged = {
    materialComponents: input.materialComponents ?? doc.materialComponents,
    labourComponents: input.labourComponents ?? doc.labourComponents,
    equipmentComponents: input.equipmentComponents ?? doc.equipmentComponents,
    overheadPercent: input.overheadPercent ?? doc.overheadPercent,
  };
  const computed = await normalizeRateComponents(merged);

  Object.assign(doc, {
    name: input.name ?? doc.name,
    costHead: input.costHead ?? doc.costHead,
    unit: input.unit ?? doc.unit,
    isActive: input.isActive ?? doc.isActive,
    notes: input.notes ?? doc.notes,
    ...computed,
    updatedBy: user._id,
  });
  await doc.save();
  await doc.populate('createdBy', PERSON_SELECT);
  return toRateAnalysisDto(doc);
}

export async function deleteRateAnalysis(id) {
  const doc = await RateAnalysis.findByIdAndDelete(id);
  if (!doc) throw ApiError.notFound('Rate analysis template not found');
  return { id: String(doc._id), code: doc.code };
}

/* =========================================================================
 * ESTIMATES, BOQ ITEMS, REVISIONS & APPROVAL
 * ========================================================================= */

const ESTIMATE_POPULATE = [
  { path: 'project', select: 'code name status' },
  { path: 'convertedProject', select: 'code name status' },
  { path: 'convertedBy', select: PERSON_SELECT },
  { path: 'createdBy submittedBy decidedBy approvalHistory.by', select: PERSON_SELECT },
];

export async function listEstimates(user, query = {}) {
  const filter = { ...buildEstimationScope(user, 'project') };
  if (query.status) filter.status = query.status;
  if (query.project) filter.project = query.project;
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ estimateNumber: rx }, { title: rx }, { enquiryCode: rx }, { 'client.name': rx }];
  }

  const pagination = parsePagination(query, { allowedSortFields: ESTIMATE_SORT_FIELDS, defaultSort: '-createdAt' });
  const { items, meta } = await paginate(Estimate, filter, pagination, { populate: ESTIMATE_POPULATE });
  return { items: items.map(toEstimateDto), meta };
}

export async function getEstimateById(user, id) {
  const estimate = await Estimate.findById(id).populate(ESTIMATE_POPULATE);
  assertRecordAccess(user, estimate);

  const boqItems = await BoqItem.find({ estimate: estimate._id })
    .populate('rateAnalysis', 'code name compositeRate')
    .populate('material', 'code name unit standardRate')
    .sort({ costHead: 1, wbsCode: 1, createdAt: 1 });

  return {
    ...toEstimateDto(estimate),
    boqItems: boqItems.map(toBoqItemDto),
  };
}

export async function createEstimate(user, input) {
  if (input.project && !canAccessProject(user, input.project)) {
    throw ApiError.forbidden('You do not have access to this project');
  }
  const estimateNumber = await nextSequenceNumber('estimate', { prefixOverride: 'EST', minPadding: 3 });

  const estimate = await Estimate.create({
    ...input,
    estimateNumber,
    version: 1,
    status: APPROVAL_STATUS.DRAFT,
    createdBy: user._id,
    updatedBy: user._id,
  });

  await estimate.populate(ESTIMATE_POPULATE);
  return toEstimateDto(estimate);
}

export async function updateEstimate(user, id, input) {
  const estimate = await Estimate.findById(id);
  assertRecordAccess(user, estimate);

  if (estimate.status === APPROVAL_STATUS.APPROVED || estimate.convertedProject) {
    throw ApiError.badRequest('Approved or converted estimates are locked. Create a new revision to make changes.');
  }

  if (input.project && !canAccessProject(user, input.project)) {
    throw ApiError.forbidden('You do not have access to the selected project');
  }

  Object.assign(estimate, input);
  Object.assign(estimate, computeCommercialTotals(estimate, estimate.boqSummary));
  estimate.updatedBy = user._id;
  await estimate.save();
  await estimate.populate(ESTIMATE_POPULATE);
  return toEstimateDto(estimate);
}

export async function createEstimateRevision(user, id, { revisionNotes = '' } = {}) {
  const source = await Estimate.findById(id).lean();
  assertRecordAccess(user, source);

  const rootId = source.parentEstimate || source._id;
  const latest = await Estimate.findOne({ $or: [{ _id: rootId }, { parentEstimate: rootId }] })
    .sort({ version: -1 })
    .select('version')
    .lean();
  const nextVersion = (latest?.version ?? source.version ?? 1) + 1;
  const estimateNumber = await nextSequenceNumber('estimate', { prefixOverride: 'EST', minPadding: 3 });

  const revision = await Estimate.create({
    estimateNumber,
    title: source.title,
    version: nextVersion,
    parentEstimate: rootId,
    revisionNotes: revisionNotes || `Revision v${nextVersion} from ${source.estimateNumber}`,
    enquiryCode: source.enquiryCode,
    client: source.client,
    location: source.location,
    project: source.project || null,
    overheadPercent: source.overheadPercent,
    contingencyPercent: source.contingencyPercent,
    profitMarginPercent: source.profitMarginPercent,
    gstPercent: source.gstPercent,
    proposalSummary: source.proposalSummary,
    validityDays: source.validityDays,
    paymentTerms: source.paymentTerms,
    assumptions: source.assumptions,
    exclusions: source.exclusions,
    status: APPROVAL_STATUS.DRAFT,
    createdBy: user._id,
    updatedBy: user._id,
  });

  const sourceBoqs = await BoqItem.find({ estimate: source._id }).lean();
  if (sourceBoqs.length > 0) {
    await BoqItem.insertMany(
      sourceBoqs.map((b) => ({
        estimate: revision._id,
        project: revision.project || null,
        itemCode: b.itemCode,
        wbsCode: b.wbsCode,
        workPackage: b.workPackage,
        costHead: b.costHead,
        description: b.description,
        unit: b.unit,
        takeoff: b.takeoff,
        quantity: b.quantity,
        rateAnalysis: b.rateAnalysis,
        material: b.material,
        materialRate: b.materialRate,
        labourRate: b.labourRate,
        equipmentRate: b.equipmentRate,
        subcontractorRate: b.subcontractorRate,
        unitRate: b.unitRate,
        amount: b.amount,
        notes: b.notes,
        createdBy: user._id,
        updatedBy: user._id,
      })),
    );
  }

  await recalculateEstimateTotals(revision._id);
  return getEstimateById(user, revision._id);
}

async function resolveBoqItemPricing(input, existing = null) {
  let materialRate = input.materialRate ?? existing?.materialRate ?? 0;
  let labourRate = input.labourRate ?? existing?.labourRate ?? 0;
  let equipmentRate = input.equipmentRate ?? existing?.equipmentRate ?? 0;
  const subcontractorRate = input.subcontractorRate ?? existing?.subcontractorRate ?? 0;
  let unit = input.unit ?? existing?.unit;
  let costHead = input.costHead ?? existing?.costHead;

  if (input.rateAnalysis) {
    const ra = await RateAnalysis.findById(input.rateAnalysis).lean();
    if (!ra) throw ApiError.validation([{ field: 'rateAnalysis', message: 'Selected rate analysis not found' }]);
    if (input.materialRate === undefined) materialRate = ra.materialUnitCost ?? 0;
    if (input.labourRate === undefined) labourRate = ra.labourUnitCost ?? 0;
    if (input.equipmentRate === undefined) equipmentRate = ra.equipmentUnitCost ?? 0;
    if (!unit) unit = ra.unit;
    if (!costHead) costHead = ra.costHead;
  }

  if (input.material) {
    const mat = await Material.findById(input.material).lean();
    if (!mat) throw ApiError.validation([{ field: 'material', message: 'Selected material not found' }]);
    if (input.materialRate === undefined && !input.rateAnalysis) {
      materialRate = mat.standardRate ?? 0;
    }
    if (!unit) unit = mat.unit;
  }

  const componentSum = round2(materialRate + labourRate + equipmentRate + subcontractorRate);
  const unitRate =
    input.unitRate !== undefined && input.unitRate > 0
      ? round2(input.unitRate)
      : componentSum > 0
        ? componentSum
        : round2(existing?.unitRate ?? 0);

  return { materialRate, labourRate, equipmentRate, subcontractorRate, unitRate, unit, costHead };
}

export async function addBoqItem(user, estimateId, input) {
  const estimate = await Estimate.findById(estimateId);
  assertRecordAccess(user, estimate);
  if (estimate.status === APPROVAL_STATUS.APPROVED || estimate.convertedProject) {
    throw ApiError.badRequest('Cannot modify BOQ of an approved or converted estimate');
  }

  const pricing = await resolveBoqItemPricing(input);
  const quantity = computeTakeoffQuantity(input.takeoff, input.quantity);
  const amount = round2(quantity * pricing.unitRate);

  const item = await BoqItem.create({
    estimate: estimate._id,
    project: estimate.project || null,
    itemCode: input.itemCode || '',
    wbsCode: input.wbsCode || '',
    workPackage: input.workPackage || '',
    costHead: pricing.costHead,
    description: input.description,
    unit: pricing.unit,
    takeoff: input.takeoff,
    quantity,
    rateAnalysis: input.rateAnalysis || null,
    material: input.material || null,
    materialRate: pricing.materialRate,
    labourRate: pricing.labourRate,
    equipmentRate: pricing.equipmentRate,
    subcontractorRate: pricing.subcontractorRate,
    unitRate: pricing.unitRate,
    amount,
    notes: input.notes || '',
    createdBy: user._id,
    updatedBy: user._id,
  });

  await recalculateEstimateTotals(estimate._id);
  await item.populate('rateAnalysis', 'code name compositeRate');
  await item.populate('material', 'code name unit standardRate');
  return toBoqItemDto(item);
}

export async function updateBoqItem(user, estimateId, itemId, input) {
  const estimate = await Estimate.findById(estimateId);
  assertRecordAccess(user, estimate);
  if (estimate.status === APPROVAL_STATUS.APPROVED || estimate.convertedProject) {
    throw ApiError.badRequest('Cannot modify BOQ of an approved or converted estimate');
  }

  const item = await BoqItem.findOne({ _id: itemId, estimate: estimate._id });
  if (!item) throw ApiError.notFound('BOQ line item not found');

  const pricing = await resolveBoqItemPricing(input, item);
  const nextTakeoff = input.takeoff ? { ...item.takeoff?.toObject?.(), ...input.takeoff } : item.takeoff;
  const quantity =
    input.quantity !== undefined || input.takeoff !== undefined
      ? computeTakeoffQuantity(nextTakeoff, input.quantity)
      : item.quantity;

  Object.assign(item, {
    itemCode: input.itemCode ?? item.itemCode,
    wbsCode: input.wbsCode ?? item.wbsCode,
    workPackage: input.workPackage ?? item.workPackage,
    costHead: pricing.costHead,
    description: input.description ?? item.description,
    unit: pricing.unit,
    takeoff: nextTakeoff,
    quantity,
    rateAnalysis: input.rateAnalysis !== undefined ? input.rateAnalysis : item.rateAnalysis,
    material: input.material !== undefined ? input.material : item.material,
    materialRate: pricing.materialRate,
    labourRate: pricing.labourRate,
    equipmentRate: pricing.equipmentRate,
    subcontractorRate: pricing.subcontractorRate,
    unitRate: pricing.unitRate,
    amount: round2(quantity * pricing.unitRate),
    notes: input.notes ?? item.notes,
    updatedBy: user._id,
  });
  await item.save();

  await recalculateEstimateTotals(estimate._id);
  await item.populate('rateAnalysis', 'code name compositeRate');
  await item.populate('material', 'code name unit standardRate');
  return toBoqItemDto(item);
}

export async function deleteBoqItem(user, estimateId, itemId) {
  const estimate = await Estimate.findById(estimateId);
  assertRecordAccess(user, estimate);
  if (estimate.status === APPROVAL_STATUS.APPROVED || estimate.convertedProject) {
    throw ApiError.badRequest('Cannot modify BOQ of an approved or converted estimate');
  }

  const item = await BoqItem.findOneAndDelete({ _id: itemId, estimate: estimate._id });
  if (!item) throw ApiError.notFound('BOQ line item not found');

  await recalculateEstimateTotals(estimate._id);
  return { id: String(item._id), estimate: String(estimate._id), description: item.description };
}

export async function transitionEstimate(user, id, { status: targetStatus, comment }) {
  const estimate = await Estimate.findById(id);
  assertRecordAccess(user, estimate);

  await executeApprovalTransition(user, estimate, {
    module: MODULES.ESTIMATION,
    targetStatus,
    comment,
  });

  estimate.updatedBy = user._id;
  await estimate.save();

  if (targetStatus === APPROVAL_STATUS.SUBMITTED) {
    if (estimate.project) {
      await notifyProjectApprovers({
        projectId: estimate.project,
        module: MODULES.ESTIMATION,
        excludeUserId: user._id,
        title: `Estimate ${estimate.estimateNumber} awaiting approval`,
        message: `${estimate.title} (v${estimate.version}) · Quoted total: ₹${estimate.quotedTotal}`,
        entityType: 'Estimate',
        entityId: estimate._id,
        link: `/estimation/${estimate._id}`,
        createdBy: user._id,
      });
    } else {
      const roles = await Role.find({
        isActive: true,
        permissions: { $elemMatch: { module: MODULES.ESTIMATION, actions: ACTIONS.APPROVE } },
      }).select('_id');
      const approvers = await User.find({
        status: USER_STATUS.ACTIVE,
        role: { $in: roles.map((r) => r._id) },
        _id: { $ne: user._id },
      })
        .select('_id')
        .lean();
      await notifyUsers(
        approvers.map((a) => a._id),
        {
          type: NOTIFICATION_TYPES.APPROVAL_REQUIRED,
          title: `Estimate ${estimate.estimateNumber} awaiting approval`,
          message: `${estimate.title} (v${estimate.version}) · Quoted total: ₹${estimate.quotedTotal}`,
          module: MODULES.ESTIMATION,
          entityType: 'Estimate',
          entityId: estimate._id,
          link: `/estimation/${estimate._id}`,
          createdBy: user._id,
        },
      );
    }
  } else if ([APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.RETURNED].includes(targetStatus)) {
    const recipient = estimate.submittedBy || estimate.createdBy;
    if (recipient && String(recipient) !== String(user._id)) {
      await notifyUsers([recipient], {
        type: NOTIFICATION_TYPES.APPROVAL_DECIDED,
        title: `Estimate ${estimate.estimateNumber} ${targetStatus}`,
        message: comment || `Estimate "${estimate.title}" was ${targetStatus}.`,
        module: MODULES.ESTIMATION,
        entityType: 'Estimate',
        entityId: estimate._id,
        project: estimate.project || null,
        link: `/estimation/${estimate._id}`,
        createdBy: user._id,
      });
    }
  }

  await estimate.populate(ESTIMATE_POPULATE);
  return toEstimateDto(estimate);
}

export async function convertEstimateToProject(user, estimateId, input = {}) {
  const estimate = await Estimate.findById(estimateId);
  assertRecordAccess(user, estimate);

  if (estimate.status !== APPROVAL_STATUS.APPROVED) {
    throw ApiError.badRequest('Only approved estimates can be converted into a Project & Baseline');
  }
  if (estimate.convertedProject) {
    throw ApiError.badRequest('This estimate has already been converted to a project');
  }

  let project;
  const pmId = input.projectManager || user._id;

  if (input.existingProjectId) {
    if (!canAccessProject(user, input.existingProjectId)) {
      throw ApiError.forbidden('You do not have access to the selected target project');
    }
    project = await Project.findById(input.existingProjectId);
    if (!project) throw ApiError.notFound('Target project not found');
    project.contractValue = estimate.quotedTotal;
    project.estimateRef = estimate._id;
    if (input.startDate) project.startDate = input.startDate;
    if (input.plannedEndDate) project.plannedEndDate = input.plannedEndDate;
    project.updatedBy = user._id;
  } else {
    const pmUser = await User.findOne({ _id: pmId, status: USER_STATUS.ACTIVE }).populate('role');
    if (!pmUser) throw ApiError.validation([{ field: 'projectManager', message: 'Choose an active Project Manager' }]);

    const code = await nextSequenceNumber('project', { prefixOverride: 'PRJ', minPadding: 3 });
    project = new Project({
      code,
      name: (input.projectName || estimate.title).slice(0, 120),
      description: estimate.proposalSummary || `Converted from ${estimate.estimateNumber} (v${estimate.version})`,
      status: PROJECT_STATUS.PLANNING,
      client: {
        name: estimate.client?.name || '',
        contactPerson: estimate.client?.contactPerson || '',
        phone: estimate.client?.phone || '',
      },
      location: {
        address: estimate.location?.address || '',
        city: estimate.location?.city || '',
        state: estimate.location?.state || '',
      },
      contractValue: estimate.quotedTotal,
      startDate: input.startDate ?? new Date(),
      plannedEndDate: input.plannedEndDate ?? null,
      projectManager: pmUser._id,
      estimateRef: estimate._id,
      createdBy: user._id,
      updatedBy: user._id,
    });
  }

  if (input.freezeBaseline !== false) {
    project.baseline = {
      startDate: project.startDate ?? null,
      plannedEndDate: project.plannedEndDate ?? null,
      contractValue: project.contractValue ?? 0,
      progressPercent: 0,
      lockedAt: new Date(),
      lockedBy: user._id,
      notes: `Baseline seeded from ${estimate.estimateNumber} (v${estimate.version})`,
    };
  }

  await project.save();

  // Grant assignedProjects access to creator and PM so they never get locked out of newly converted project
  const usersToAssign = [...new Set([String(user._id), project.projectManager ? String(project.projectManager) : null].filter(Boolean))];
  await User.updateMany({ _id: { $in: usersToAssign } }, { $addToSet: { assignedProjects: project._id } });

  // Link BOQ items to project
  await BoqItem.updateMany({ estimate: estimate._id }, { $set: { project: project._id } });

  // Optionally generate grouped WBS starter Tasks from BOQ workPackages/costHeads
  if (input.createWbsTasks !== false) {
    const boqItems = await BoqItem.find({ estimate: estimate._id }).lean();
    const groups = new Map();
    for (const item of boqItems) {
      const pkg = item.workPackage || item.costHead;
      if (!groups.has(pkg)) {
        groups.set(pkg, { workPackage: pkg, wbsCode: item.wbsCode || '', amount: 0 });
      }
      groups.get(pkg).amount += item.amount || 0;
    }

    const totalAmount = [...groups.values()].reduce((s, g) => s + g.amount, 0) || 1;
    let idx = 1;
    for (const group of groups.values()) {
      const taskCode = await nextSequenceNumber('task', {
        scopeKey: String(project._id),
        contextCode: project.code,
        prefixOverride: 'TSK',
        minPadding: 3,
      });
      await Task.create({
        code: taskCode,
        title: group.workPackage,
        project: project._id,
        wbsCode: group.wbsCode || `${idx}.0`,
        workPackage: group.workPackage,
        status: TASK_STATUS.TODO,
        weightPercent: Math.max(1, Math.min(100, Math.round((group.amount / totalAmount) * 100))),
        startDate: project.startDate ?? null,
        dueDate: project.plannedEndDate ?? null,
        baselineStartDate: project.startDate ?? null,
        baselineDueDate: project.plannedEndDate ?? null,
        createdBy: user._id,
        updatedBy: user._id,
      });
      idx += 1;
    }
  }

  estimate.project = project._id;
  estimate.convertedProject = project._id;
  estimate.convertedAt = new Date();
  estimate.convertedBy = user._id;
  estimate.updatedBy = user._id;
  await estimate.save();

  await project.populate('projectManager baseline.lockedBy', PERSON_SELECT);
  return {
    estimate: toEstimateDto(estimate),
    project: toProjectDto(project),
  };
}

/* =========================================================================
 * BUDGET VS COMMITMENT VS ACTUAL FOUNDATION
 * ========================================================================= */

export async function getBudgetAnalysis(user, estimateId) {
  const estimate = await Estimate.findById(estimateId).populate('project convertedProject', 'code name contractValue');
  assertRecordAccess(user, estimate);

  const boqItems = await BoqItem.find({ estimate: estimate._id }).lean();
  const byCostHeadMap = new Map();

  for (const item of boqItems) {
    const key = item.costHead || 'General';
    if (!byCostHeadMap.has(key)) {
      byCostHeadMap.set(key, {
        costHead: key,
        itemCount: 0,
        plannedMaterial: 0,
        plannedLabour: 0,
        plannedEquipment: 0,
        plannedSubcontractor: 0,
        plannedDirectCost: 0,
      });
    }
    const row = byCostHeadMap.get(key);
    row.itemCount += 1;
    const qty = Number(item.quantity) || 0;
    row.plannedMaterial = round2(row.plannedMaterial + qty * (item.materialRate || 0));
    row.plannedLabour = round2(row.plannedLabour + qty * (item.labourRate || 0));
    row.plannedEquipment = round2(row.plannedEquipment + qty * (item.equipmentRate || 0));
    row.plannedSubcontractor = round2(row.plannedSubcontractor + qty * (item.subcontractorRate || 0));
    row.plannedDirectCost = round2(row.plannedDirectCost + (item.amount || 0));
  }

  const projectId = estimate.convertedProject?._id || estimate.project?._id || null;
  let committedPoTotal = 0;
  let actualMaterialIssued = 0;

  if (projectId) {
    const [poAgg, issueAgg] = await Promise.all([
      PurchaseOrder.aggregate([
        {
          $match: {
            project: projectId,
            status: { $in: [APPROVAL_STATUS.SUBMITTED, APPROVAL_STATUS.UNDER_REVIEW, APPROVAL_STATUS.APPROVED] },
          },
        },
        { $group: { _id: null, total: { $sum: '$grandTotal' } } },
      ]),
      InventoryTransaction.aggregate([
        { $match: { project: projectId, type: TRANSACTION_TYPES.ISSUE } },
        { $group: { _id: null, total: { $sum: '$totalValue' } } },
      ]),
    ]);
    committedPoTotal = round2(poAgg[0]?.total ?? 0);
    actualMaterialIssued = round2(issueAgg[0]?.total ?? 0);
  }

  const directBaseline = estimate.boqSummary?.directCost ?? 0;
  const remainingDirectBudget = round2(directBaseline - committedPoTotal - actualMaterialIssued);

  return {
    estimateId: String(estimate._id),
    estimateNumber: estimate.estimateNumber,
    version: estimate.version,
    status: estimate.status,
    project: estimate.convertedProject
      ? {
          id: String(estimate.convertedProject._id),
          code: estimate.convertedProject.code,
          name: estimate.convertedProject.name,
          contractValue: estimate.convertedProject.contractValue,
        }
      : null,
    costHeads: Array.from(byCostHeadMap.values()),
    totals: {
      directBaseline,
      subTotalBeforeTax: estimate.subTotalBeforeTax ?? 0,
      quotedTotal: estimate.quotedTotal ?? 0,
      committedPoTotal,
      actualMaterialIssued,
      remainingDirectBudget,
    },
  };
}

/* =========================================================================
 * TENDERS & BID COMPARISON
 * ========================================================================= */

const TENDER_POPULATE = [
  { path: 'estimate', select: 'estimateNumber title quotedTotal' },
  { path: 'project', select: 'code name status' },
  { path: 'bids.vendorRef', select: 'code name' },
  { path: 'awardedBy createdBy', select: PERSON_SELECT },
];

export async function listTenders(user, query = {}) {
  const filter = { ...buildEstimationScope(user, 'project') };
  if (query.status) filter.status = query.status;
  if (query.tenderType) filter.tenderType = query.tenderType;
  if (query.estimate) filter.estimate = query.estimate;
  if (query.project) filter.project = query.project;
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ tenderNumber: rx }, { title: rx }, { scopeSummary: rx }];
  }

  const pagination = parsePagination(query, { allowedSortFields: ['createdAt', 'tenderNumber', 'submissionDeadline'], defaultSort: '-createdAt' });
  const { items, meta } = await paginate(Tender, filter, pagination, { populate: TENDER_POPULATE });
  return { items: items.map(toTenderDto), meta };
}

export async function getTenderById(user, id) {
  const tender = await Tender.findById(id).populate(TENDER_POPULATE);
  assertRecordAccess(user, tender);
  return toTenderDto(tender);
}

export async function createTender(user, input) {
  if (input.project && !canAccessProject(user, input.project)) {
    throw ApiError.forbidden('You do not have access to the selected project');
  }
  const tenderNumber = await nextSequenceNumber('tender', { prefixOverride: 'TND', minPadding: 3 });

  let estimatedValue = input.estimatedValue ?? 0;
  let project = input.project || null;
  if (input.estimate) {
    const est = await Estimate.findById(input.estimate).lean();
    if (!est) throw ApiError.validation([{ field: 'estimate', message: 'Selected estimate not found' }]);
    if (!estimatedValue) estimatedValue = est.quotedTotal ?? 0;
    if (!project && est.project) project = est.project;
  }

  const tender = await Tender.create({
    tenderNumber,
    title: input.title,
    estimate: input.estimate || null,
    project,
    tenderType: input.tenderType || 'subcontractor_package',
    submissionDeadline: input.submissionDeadline ?? null,
    estimatedValue,
    scopeSummary: input.scopeSummary || '',
    status: TENDER_STATUS.OPEN,
    createdBy: user._id,
    updatedBy: user._id,
  });

  await tender.populate(TENDER_POPULATE);
  return toTenderDto(tender);
}

export async function updateTender(user, id, input) {
  const tender = await Tender.findById(id);
  assertRecordAccess(user, tender);
  if (tender.status === TENDER_STATUS.AWARDED && input.status && input.status !== TENDER_STATUS.CLOSED) {
    throw ApiError.badRequest('Awarded tender can only move to closed status');
  }
  if (input.project && !canAccessProject(user, input.project)) {
    throw ApiError.forbidden('You do not have access to the selected project');
  }

  Object.assign(tender, input);
  tender.updatedBy = user._id;
  await tender.save();
  await tender.populate(TENDER_POPULATE);
  return toTenderDto(tender);
}

export async function addTenderBid(user, tenderId, input) {
  const tender = await Tender.findById(tenderId);
  assertRecordAccess(user, tender);

  if ([TENDER_STATUS.AWARDED, TENDER_STATUS.CLOSED, TENDER_STATUS.CANCELLED].includes(tender.status)) {
    throw ApiError.badRequest(`Cannot add bids when tender is "${tender.status}"`);
  }

  if (input.vendorRef) {
    const vendor = await Vendor.findById(input.vendorRef).select('name').lean();
    if (!vendor) throw ApiError.validation([{ field: 'vendorRef', message: 'Selected vendor not found' }]);
  }

  tender.bids.push({
    bidderName: input.bidderName,
    vendorRef: input.vendorRef || null,
    quotedAmount: input.quotedAmount,
    technicalScore: input.technicalScore ?? 70,
    completionDays: input.completionDays ?? 90,
    validityDays: input.validityDays ?? 30,
    status: input.status || BID_STATUS.SUBMITTED,
    remarks: input.remarks || '',
    submittedAt: new Date(),
  });
  if (tender.status === TENDER_STATUS.OPEN) {
    tender.status = TENDER_STATUS.EVALUATION;
  }
  tender.updatedBy = user._id;
  await tender.save();
  await tender.populate(TENDER_POPULATE);
  return toTenderDto(tender);
}

export async function awardTenderBid(user, tenderId, { bidId, comment = '' }) {
  const tender = await Tender.findById(tenderId);
  assertRecordAccess(user, tender);

  if ([TENDER_STATUS.AWARDED, TENDER_STATUS.CANCELLED].includes(tender.status)) {
    throw ApiError.badRequest(`Tender is already "${tender.status}"`);
  }

  const targetBid = tender.bids.id(bidId);
  if (!targetBid) throw ApiError.notFound('Selected bid not found on this tender');

  for (const b of tender.bids) {
    b.status = String(b._id) === String(bidId) ? BID_STATUS.AWARDED : BID_STATUS.REJECTED;
  }

  tender.status = TENDER_STATUS.AWARDED;
  tender.awardedBidId = targetBid._id;
  tender.awardedAt = new Date();
  tender.awardedBy = user._id;
  tender.awardComment = comment;
  tender.updatedBy = user._id;
  await tender.save();
  await tender.populate(TENDER_POPULATE);
  return toTenderDto(tender);
}

