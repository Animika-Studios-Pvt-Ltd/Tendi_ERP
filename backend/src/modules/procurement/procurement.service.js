import { MODULES } from '../../config/rbac.js';
import { GoodsReceipt } from '../../models/GoodsReceipt.js';
import { TRANSACTION_TYPES } from '../../models/InventoryTransaction.js';
import { Material } from '../../models/Material.js';
import { MaterialRequest } from '../../models/MaterialRequest.js';
import { NOTIFICATION_TYPES } from '../../models/Notification.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { Project } from '../../models/Project.js';
import { PurchaseOrder } from '../../models/PurchaseOrder.js';
import { Site } from '../../models/Site.js';
import { Vendor } from '../../models/Vendor.js';
import { executeApprovalTransition } from '../../services/approval.service.js';
import { notifyProjectApprovers, notifyUsers } from '../../services/notification.service.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { paginate, parsePagination } from '../../utils/pagination.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';
import { recordTransaction } from '../inventory/inventory.service.js';

const VENDOR_SORT_FIELDS = ['createdAt', 'name', 'code', 'rating'];
const MR_SORT_FIELDS = ['createdAt', 'requiredByDate', 'priority', 'status', 'requestNumber'];
const PO_SORT_FIELDS = ['createdAt', 'poDate', 'grandTotal', 'status', 'poNumber'];
const GRN_SORT_FIELDS = ['createdAt', 'receivedDate', 'grnNumber'];

const PERSON_SELECT = 'firstName lastName email';
const PROJECT_SELECT = 'code name';
const MATERIAL_SELECT = 'code name unit category';
const VENDOR_SELECT = 'code name contactPerson phone email gstin';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fullName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ');
const toPerson = (p) => (p?._id ? { id: String(p._id), fullName: fullName(p), email: p.email } : null);

const scoped = (user, filter) => ({
  $and: [buildProjectScope(user, { projectField: 'project' }), filter],
});

/* =========================================================================
 * VENDORS
 * ========================================================================= */

export function toVendorDto(doc) {
  const v = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(v._id),
    code: v.code,
    name: v.name,
    contactPerson: v.contactPerson ?? '',
    email: v.email ?? '',
    phone: v.phone ?? '',
    gstin: v.gstin ?? '',
    pan: v.pan ?? '',
    categories: v.categories ?? [],
    address: { street: '', city: '', state: '', pincode: '', ...v.address },
    paymentTermsDays: v.paymentTermsDays ?? 30,
    rating: v.rating ?? 4,
    isActive: v.isActive ?? true,
    createdAt: v.createdAt,
  };
}

export async function listVendors(query = {}) {
  const filter = {};
  if (query.category) filter.categories = query.category;
  if (query.isActive !== undefined) filter.isActive = query.isActive === true || query.isActive === 'true';
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: pattern }, { code: pattern }, { gstin: pattern }, { contactPerson: pattern }];
  }
  const pagination = parsePagination(query, { allowedSortFields: VENDOR_SORT_FIELDS, defaultSort: 'name' });
  const { items, meta } = await paginate(Vendor, filter, pagination);
  return { items: items.map(toVendorDto), meta };
}

export async function getVendorById(id) {
  const v = await Vendor.findById(id);
  if (!v) throw ApiError.notFound('Vendor not found');
  return toVendorDto(v);
}

export async function createVendor(user, input) {
  const existing = await Vendor.findOne({ code: input.code.toUpperCase() });
  if (existing) throw ApiError.conflict('A vendor with this code already exists');

  const vendor = await Vendor.create({
    ...input,
    code: input.code.toUpperCase(),
    createdBy: user._id,
    updatedBy: user._id,
  });
  return toVendorDto(vendor);
}

export async function updateVendor(user, id, input) {
  const vendor = await Vendor.findById(id);
  if (!vendor) throw ApiError.notFound('Vendor not found');
  Object.assign(vendor, input);
  vendor.updatedBy = user._id;
  await vendor.save();
  return toVendorDto(vendor);
}

export async function deleteVendor(id) {
  const vendor = await Vendor.findById(id);
  if (!vendor) throw ApiError.notFound('Vendor not found');
  const poCount = await PurchaseOrder.countDocuments({ vendor: vendor._id });
  if (poCount > 0) {
    throw ApiError.badRequest(`Cannot delete vendor with ${poCount} existing purchase orders. Deactivate instead.`);
  }
  await Vendor.findByIdAndDelete(id);
  return { id, code: vendor.code };
}

/* =========================================================================
 * MATERIAL REQUESTS (MR)
 * ========================================================================= */

export function toMrDto(doc) {
  const mr = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(mr._id),
    requestNumber: mr.requestNumber,
    project: mr.project ? { id: String(mr.project._id || mr.project), code: mr.project.code ?? '', name: mr.project.name ?? '' } : null,
    site: mr.site ? { id: String(mr.site._id || mr.site), code: mr.site.code ?? '', name: mr.site.name ?? '' } : null,
    requiredByDate: mr.requiredByDate,
    priority: mr.priority,
    items: (mr.items ?? []).map((it) => ({
      material: it.material
        ? { id: String(it.material._id || it.material), code: it.material.code ?? '', name: it.material.name ?? '', unit: it.material.unit ?? '' }
        : null,
      quantity: it.quantity,
      unit: it.unit,
      notes: it.notes ?? '',
    })),
    remarks: mr.remarks ?? '',
    status: mr.status,
    submittedBy: toPerson(mr.submittedBy),
    submittedAt: mr.submittedAt ?? null,
    decidedBy: toPerson(mr.decidedBy),
    decidedAt: mr.decidedAt ?? null,
    decisionComment: mr.decisionComment ?? '',
    approvalHistory: (mr.approvalHistory ?? []).map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      by: toPerson(h.by),
      comment: h.comment ?? '',
      at: h.at,
    })),
    createdBy: toPerson(mr.createdBy),
    createdAt: mr.createdAt,
  };
}

export async function listMrs(user, query = {}) {
  const filter = {};
  if (query.project) filter.project = query.project;
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ requestNumber: pattern }, { remarks: pattern }];
  }

  const pagination = parsePagination(query, { allowedSortFields: MR_SORT_FIELDS, defaultSort: '-createdAt' });
  const { items, meta } = await paginate(MaterialRequest, scoped(user, filter), pagination, {
    populate: [
      { path: 'project', select: PROJECT_SELECT },
      { path: 'site', select: 'code name' },
      { path: 'items.material', select: MATERIAL_SELECT },
      { path: 'createdBy', select: PERSON_SELECT },
    ],
  });
  return { items: items.map(toMrDto), meta };
}

export async function getMrById(user, id) {
  const mr = await MaterialRequest.findOne(scoped(user, { _id: id }))
    .populate('project', PROJECT_SELECT)
    .populate('site', 'code name')
    .populate('items.material', MATERIAL_SELECT)
    .populate('createdBy', PERSON_SELECT)
    .populate('submittedBy', PERSON_SELECT)
    .populate('decidedBy', PERSON_SELECT)
    .populate('approvalHistory.by', PERSON_SELECT);
  if (!mr) throw ApiError.notFound('Material request not found');
  return toMrDto(mr);
}

export async function createMr(user, input) {
  if (!canAccessProject(user, input.project)) throw ApiError.forbidden('You do not have access to this project');
  const project = await Project.findById(input.project);
  if (!project) throw ApiError.notFound('Project not found');

  const materialIds = input.items.map((i) => i.material);
  const validMats = await Material.countDocuments({ _id: { $in: materialIds } });
  if (validMats !== new Set(materialIds).size) {
    throw ApiError.badRequest('One or more selected materials do not exist');
  }

  const requestNumber = await nextSequenceNumber('materialRequest', {
    scopeKey: String(project._id),
    contextCode: project.code,
  });

  const mr = await MaterialRequest.create({
    ...input,
    requestNumber,
    requiredByDate: new Date(input.requiredByDate),
    status: APPROVAL_STATUS.DRAFT,
    createdBy: user._id,
    updatedBy: user._id,
  });

  await mr.populate([
    { path: 'project', select: PROJECT_SELECT },
    { path: 'site', select: 'code name' },
    { path: 'items.material', select: MATERIAL_SELECT },
    { path: 'createdBy', select: PERSON_SELECT },
  ]);
  return toMrDto(mr);
}

export async function updateMr(user, id, input) {
  const mr = await MaterialRequest.findOne(scoped(user, { _id: id }));
  if (!mr) throw ApiError.notFound('Material request not found');
  if (![APPROVAL_STATUS.DRAFT, APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.RETURNED].includes(mr.status)) {
    throw ApiError.badRequest(`Cannot edit material request in "${mr.status}" status`);
  }
  Object.assign(mr, input);
  if (input.requiredByDate) mr.requiredByDate = new Date(input.requiredByDate);
  mr.updatedBy = user._id;
  await mr.save();
  return getMrById(user, mr._id);
}

export async function transitionMr(user, id, { status: targetStatus, comment }) {
  const mr = await MaterialRequest.findOne(scoped(user, { _id: id }));
  if (!mr) throw ApiError.notFound('Material request not found');

  await executeApprovalTransition(user, mr, {
    module: MODULES.PROCUREMENT,
    targetStatus,
    comment,
  });
  mr.updatedBy = user._id;
  await mr.save();

  if (targetStatus === APPROVAL_STATUS.SUBMITTED) {
    await notifyProjectApprovers({
      projectId: mr.project,
      module: MODULES.PROCUREMENT,
      excludeUserId: user._id,
      title: `Material Request ${mr.requestNumber} awaiting approval`,
      message: `Priority: ${mr.priority}.`,
      entityType: 'MaterialRequest',
      entityId: mr._id,
      link: '/procurement',
      createdBy: user._id,
    });
  } else if ([APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.RETURNED].includes(targetStatus)) {
    const recipient = mr.submittedBy || mr.createdBy;
    if (recipient && String(recipient) !== String(user._id)) {
      await notifyUsers([recipient], {
        type: NOTIFICATION_TYPES.APPROVAL_DECIDED,
        title: `Material Request ${mr.requestNumber} ${targetStatus}`,
        message: comment || `Material request was ${targetStatus}.`,
        module: MODULES.PROCUREMENT,
        entityType: 'MaterialRequest',
        entityId: mr._id,
        project: mr.project,
        link: '/procurement',
        createdBy: user._id,
      });
    }
  }

  return getMrById(user, mr._id);
}

/* =========================================================================
 * PURCHASE ORDERS (PO)
 * ========================================================================= */

export function toPoDto(doc) {
  const po = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(po._id),
    poNumber: po.poNumber,
    project: po.project ? { id: String(po.project._id || po.project), code: po.project.code ?? '', name: po.project.name ?? '' } : null,
    vendor: po.vendor
      ? { id: String(po.vendor._id || po.vendor), code: po.vendor.code ?? '', name: po.vendor.name ?? '', gstin: po.vendor.gstin ?? '' }
      : null,
    materialRequest: po.materialRequest
      ? { id: String(po.materialRequest._id || po.materialRequest), requestNumber: po.materialRequest.requestNumber ?? '' }
      : null,
    poDate: po.poDate,
    expectedDeliveryDate: po.expectedDeliveryDate ?? null,
    items: (po.items ?? []).map((it) => ({
      material: it.material
        ? { id: String(it.material._id || it.material), code: it.material.code ?? '', name: it.material.name ?? '', unit: it.material.unit ?? '' }
        : null,
      quantity: it.quantity,
      receivedQuantity: it.receivedQuantity ?? 0,
      unit: it.unit,
      unitRate: it.unitRate,
      taxPercent: it.taxPercent,
      lineTotal: it.lineTotal,
    })),
    subtotal: po.subtotal,
    taxTotal: po.taxTotal,
    grandTotal: po.grandTotal,
    deliveryStatus: po.deliveryStatus,
    termsAndConditions: po.termsAndConditions ?? '',
    status: po.status,
    submittedBy: toPerson(po.submittedBy),
    submittedAt: po.submittedAt ?? null,
    decidedBy: toPerson(po.decidedBy),
    decidedAt: po.decidedAt ?? null,
    decisionComment: po.decisionComment ?? '',
    approvalHistory: (po.approvalHistory ?? []).map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      by: toPerson(h.by),
      comment: h.comment ?? '',
      at: h.at,
    })),
    createdBy: toPerson(po.createdBy),
    createdAt: po.createdAt,
  };
}

function computePoTotals(items) {
  let subtotal = 0;
  let taxTotal = 0;
  const computedItems = items.map((item) => {
    const base = item.quantity * item.unitRate;
    const tax = base * ((item.taxPercent ?? 18) / 100);
    subtotal += base;
    taxTotal += tax;
    return {
      ...item,
      receivedQuantity: item.receivedQuantity ?? 0,
      taxPercent: item.taxPercent ?? 18,
      lineTotal: Math.round((base + tax) * 100) / 100,
    };
  });

  return {
    items: computedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    grandTotal: Math.round((subtotal + taxTotal) * 100) / 100,
  };
}

export async function listPos(user, query = {}) {
  const filter = {};
  if (query.project) filter.project = query.project;
  if (query.vendor) filter.vendor = query.vendor;
  if (query.status) filter.status = query.status;
  if (query.deliveryStatus) filter.deliveryStatus = query.deliveryStatus;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ poNumber: pattern }, { termsAndConditions: pattern }];
  }

  const pagination = parsePagination(query, { allowedSortFields: PO_SORT_FIELDS, defaultSort: '-createdAt' });
  const { items, meta } = await paginate(PurchaseOrder, scoped(user, filter), pagination, {
    populate: [
      { path: 'project', select: PROJECT_SELECT },
      { path: 'vendor', select: VENDOR_SELECT },
      { path: 'items.material', select: MATERIAL_SELECT },
      { path: 'createdBy', select: PERSON_SELECT },
    ],
  });
  return { items: items.map(toPoDto), meta };
}

export async function getPoById(user, id) {
  const po = await PurchaseOrder.findOne(scoped(user, { _id: id }))
    .populate('project', PROJECT_SELECT)
    .populate('vendor', VENDOR_SELECT)
    .populate('materialRequest', 'requestNumber')
    .populate('items.material', MATERIAL_SELECT)
    .populate('createdBy', PERSON_SELECT)
    .populate('submittedBy', PERSON_SELECT)
    .populate('decidedBy', PERSON_SELECT)
    .populate('approvalHistory.by', PERSON_SELECT);
  if (!po) throw ApiError.notFound('Purchase order not found');
  return toPoDto(po);
}

export async function createPo(user, input) {
  if (!canAccessProject(user, input.project)) throw ApiError.forbidden('You do not have access to this project');

  const [project, vendor] = await Promise.all([
    Project.findById(input.project),
    Vendor.findOne({ _id: input.vendor, isActive: true }),
  ]);
  if (!project) throw ApiError.notFound('Project not found');
  if (!vendor) throw ApiError.validation([{ field: 'vendor', message: 'Choose an active vendor' }]);

  const { items, subtotal, taxTotal, grandTotal } = computePoTotals(input.items);

  const poNumber = await nextSequenceNumber('purchaseOrder', {
    scopeKey: String(project._id),
    contextCode: project.code,
  });

  const po = await PurchaseOrder.create({
    ...input,
    poNumber,
    poDate: input.poDate ? new Date(input.poDate) : new Date(),
    expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : undefined,
    items,
    subtotal,
    taxTotal,
    grandTotal,
    status: APPROVAL_STATUS.DRAFT,
    createdBy: user._id,
    updatedBy: user._id,
  });

  return getPoById(user, po._id);
}

export async function updatePo(user, id, input) {
  const po = await PurchaseOrder.findOne(scoped(user, { _id: id }));
  if (!po) throw ApiError.notFound('Purchase order not found');
  if (![APPROVAL_STATUS.DRAFT, APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.RETURNED].includes(po.status)) {
    throw ApiError.badRequest(`Cannot edit PO while status is "${po.status}"`);
  }

  Object.assign(po, input);
  if (input.items) {
    const totals = computePoTotals(input.items);
    po.items = totals.items;
    po.subtotal = totals.subtotal;
    po.taxTotal = totals.taxTotal;
    po.grandTotal = totals.grandTotal;
  }
  po.updatedBy = user._id;
  await po.save();
  return getPoById(user, po._id);
}

export async function transitionPo(user, id, { status: targetStatus, comment }) {
  const po = await PurchaseOrder.findOne(scoped(user, { _id: id }));
  if (!po) throw ApiError.notFound('Purchase order not found');

  await executeApprovalTransition(user, po, {
    module: MODULES.PROCUREMENT,
    targetStatus,
    comment,
    amount: po.grandTotal,
  });
  po.updatedBy = user._id;
  await po.save();

  if (targetStatus === APPROVAL_STATUS.SUBMITTED) {
    await notifyProjectApprovers({
      projectId: po.project,
      module: MODULES.PROCUREMENT,
      excludeUserId: user._id,
      title: `Purchase Order ${po.poNumber} awaiting approval`,
      message: `Total value: ₹${po.grandTotal}.`,
      entityType: 'PurchaseOrder',
      entityId: po._id,
      link: '/procurement/purchase-orders',
      createdBy: user._id,
    });
  } else if ([APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.RETURNED].includes(targetStatus)) {
    const recipient = po.submittedBy || po.createdBy;
    if (recipient && String(recipient) !== String(user._id)) {
      await notifyUsers([recipient], {
        type: NOTIFICATION_TYPES.APPROVAL_DECIDED,
        title: `Purchase Order ${po.poNumber} ${targetStatus}`,
        message: comment || `Purchase order was ${targetStatus}.`,
        module: MODULES.PROCUREMENT,
        entityType: 'PurchaseOrder',
        entityId: po._id,
        project: po.project,
        link: '/procurement/purchase-orders',
        createdBy: user._id,
      });
    }
  }

  return getPoById(user, po._id);
}

/* =========================================================================
 * GOODS RECEIPTS (GRN) -> AUTOMATICALLY UPDATES INVENTORY
 * ========================================================================= */

export function toGrnDto(doc) {
  const g = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(g._id),
    grnNumber: g.grnNumber,
    project: g.project ? { id: String(g.project._id || g.project), code: g.project.code ?? '', name: g.project.name ?? '' } : null,
    site: g.site ? { id: String(g.site._id || g.site), code: g.site.code ?? '', name: g.site.name ?? '' } : null,
    purchaseOrder: g.purchaseOrder
      ? { id: String(g.purchaseOrder._id || g.purchaseOrder), poNumber: g.purchaseOrder.poNumber ?? '' }
      : null,
    vendor: g.vendor ? { id: String(g.vendor._id || g.vendor), code: g.vendor.code ?? '', name: g.vendor.name ?? '' } : null,
    receivedDate: g.receivedDate,
    challanNumber: g.challanNumber ?? '',
    items: (g.items ?? []).map((it) => ({
      material: it.material
        ? { id: String(it.material._id || it.material), code: it.material.code ?? '', name: it.material.name ?? '', unit: it.material.unit ?? '' }
        : null,
      receivedQuantity: it.receivedQuantity,
      unit: it.unit,
      unitRate: it.unitRate,
      remarks: it.remarks ?? '',
    })),
    remarks: g.remarks ?? '',
    receivedBy: toPerson(g.receivedBy),
    createdAt: g.createdAt,
  };
}

export async function listGrns(user, query = {}) {
  const filter = {};
  if (query.project) filter.project = query.project;
  if (query.purchaseOrder) filter.purchaseOrder = query.purchaseOrder;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ grnNumber: pattern }, { challanNumber: pattern }, { remarks: pattern }];
  }

  const pagination = parsePagination(query, { allowedSortFields: GRN_SORT_FIELDS, defaultSort: '-receivedDate' });
  const { items, meta } = await paginate(GoodsReceipt, scoped(user, filter), pagination, {
    populate: [
      { path: 'project', select: PROJECT_SELECT },
      { path: 'site', select: 'code name' },
      { path: 'purchaseOrder', select: 'poNumber' },
      { path: 'vendor', select: VENDOR_SELECT },
      { path: 'items.material', select: MATERIAL_SELECT },
      { path: 'receivedBy', select: PERSON_SELECT },
    ],
  });
  return { items: items.map(toGrnDto), meta };
}

export async function getGrnById(user, id) {
  const grn = await GoodsReceipt.findOne(scoped(user, { _id: id }))
    .populate('project', PROJECT_SELECT)
    .populate('site', 'code name')
    .populate('purchaseOrder', 'poNumber')
    .populate('vendor', VENDOR_SELECT)
    .populate('items.material', MATERIAL_SELECT)
    .populate('receivedBy', PERSON_SELECT);
  if (!grn) throw ApiError.notFound('Goods receipt not found');
  return toGrnDto(grn);
}

export async function createGrn(user, input) {
  const po = await PurchaseOrder.findById(input.purchaseOrder);
  if (!po) throw ApiError.notFound('Purchase order not found');

  if (!canAccessProject(user, po.project)) {
    throw ApiError.forbidden('You do not have access to this project');
  }

  if (po.status !== APPROVAL_STATUS.APPROVED) {
    throw ApiError.badRequest('Goods can only be received against an approved Purchase Order');
  }

  if (input.site) {
    const site = await Site.findOne({ _id: input.site, project: po.project });
    if (!site) throw ApiError.badRequest('Selected site does not belong to the PO project');
  }

  const grnItems = [];
  for (const item of input.items) {
    const poItem = po.items.find((p) => String(p.material) === String(item.material));
    if (!poItem) {
      throw ApiError.badRequest('One of the received materials is not on this Purchase Order');
    }
    const remaining = poItem.quantity - (poItem.receivedQuantity ?? 0);
    if (item.receivedQuantity > remaining) {
      throw ApiError.badRequest(
        `Cannot receive ${item.receivedQuantity} ${poItem.unit}. Only ${remaining} ${poItem.unit} remaining on PO ${po.poNumber}.`,
      );
    }

    poItem.receivedQuantity = (poItem.receivedQuantity ?? 0) + item.receivedQuantity;
    grnItems.push({
      material: poItem.material,
      receivedQuantity: item.receivedQuantity,
      unit: poItem.unit,
      unitRate: poItem.unitRate,
      remarks: item.remarks ?? '',
    });
  }

  // Update PO delivery status
  const allReceived = po.items.every((p) => p.receivedQuantity >= p.quantity);
  po.deliveryStatus = allReceived ? 'fully_received' : 'partially_received';
  await po.save();

  const grnNumber = await nextSequenceNumber('goodsReceipt', {
    scopeKey: String(po.project),
    contextCode: po.poNumber.replace(/^[^-]+-/, ''),
    minPadding: 3,
  });

  const grn = await GoodsReceipt.create({
    grnNumber,
    project: po.project,
    site: input.site || undefined,
    purchaseOrder: po._id,
    vendor: po.vendor,
    receivedDate: input.receivedDate ? new Date(input.receivedDate) : new Date(),
    challanNumber: input.challanNumber ?? '',
    items: grnItems,
    remarks: input.remarks ?? '',
    receivedBy: user._id,
  });

  // Automatically record Inventory Receipt transactions for every item!
  for (const gItem of grnItems) {
    await recordTransaction(
      user,
      {
        project: po.project,
        site: input.site || undefined,
        material: gItem.material,
        type: TRANSACTION_TYPES.RECEIPT,
        quantity: gItem.receivedQuantity,
        unitRate: gItem.unitRate,
        referenceType: 'GoodsReceipt',
        referenceId: grn._id,
        referenceNumber: grn.grnNumber,
        transactionDate: grn.receivedDate,
        remarks: `Received via ${grn.grnNumber} (PO: ${po.poNumber})`,
      },
      { bypassAccessCheck: true },
    );
  }

  return getGrnById(user, grn._id);
}

