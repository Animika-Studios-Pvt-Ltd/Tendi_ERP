import { MODULES } from '../../config/rbac.js';
import { recordAudit } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as service from './procurement.service.js';

const audit = (req, action, extra = {}) =>
  recordAudit(req, {
    action,
    module: MODULES.PROCUREMENT,
    ...extra,
  });

/* VENDORS */
export async function listVendors(req, res) {
  const { items, meta } = await service.listVendors(req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function getVendor(req, res) {
  sendSuccess(res, await service.getVendorById(req.validated.params.id));
}

export async function createVendor(req, res) {
  const vendor = await service.createVendor(req.user, req.body);
  audit(req, 'vendor.create', {
    entityType: 'Vendor',
    entityId: vendor.id,
    summary: `Registered vendor ${vendor.code} (${vendor.name})`,
  });
  sendSuccess(res, vendor, { status: 201, message: 'Vendor created' });
}

export async function updateVendor(req, res) {
  const vendor = await service.updateVendor(req.user, req.validated.params.id, req.body);
  audit(req, 'vendor.update', {
    entityType: 'Vendor',
    entityId: vendor.id,
    summary: `Updated vendor ${vendor.code}`,
  });
  sendSuccess(res, vendor, { message: 'Vendor updated' });
}

export async function deleteVendor(req, res) {
  const result = await service.deleteVendor(req.validated.params.id);
  audit(req, 'vendor.delete', { entityType: 'Vendor', entityId: result.id, summary: `Deleted vendor ${result.code}` });
  sendSuccess(res, null, { message: 'Vendor deleted' });
}

/* MATERIAL REQUESTS */
export async function listMrs(req, res) {
  const { items, meta } = await service.listMrs(req.user, req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function getMr(req, res) {
  sendSuccess(res, await service.getMrById(req.user, req.validated.params.id));
}

export async function createMr(req, res) {
  const mr = await service.createMr(req.user, req.body);
  audit(req, 'mr.create', {
    entityType: 'MaterialRequest',
    entityId: mr.id,
    project: mr.project?.id,
    summary: `Created material request ${mr.requestNumber}`,
  });
  sendSuccess(res, mr, { status: 201, message: 'Material request drafted' });
}

export async function updateMr(req, res) {
  const mr = await service.updateMr(req.user, req.validated.params.id, req.body);
  audit(req, 'mr.update', {
    entityType: 'MaterialRequest',
    entityId: mr.id,
    project: mr.project?.id,
    summary: `Updated material request ${mr.requestNumber}`,
  });
  sendSuccess(res, mr, { message: 'Material request updated' });
}

export async function transitionMr(req, res) {
  const mr = await service.transitionMr(req.user, req.validated.params.id, req.body);
  audit(req, `mr.${mr.status}`, {
    entityType: 'MaterialRequest',
    entityId: mr.id,
    project: mr.project?.id,
    summary: `Material request ${mr.requestNumber} transitioned to "${mr.status}"`,
  });
  sendSuccess(res, mr, { message: `Material request ${mr.status}` });
}

/* PURCHASE ORDERS */
export async function listPos(req, res) {
  const { items, meta } = await service.listPos(req.user, req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function getPo(req, res) {
  sendSuccess(res, await service.getPoById(req.user, req.validated.params.id));
}

export async function createPo(req, res) {
  const po = await service.createPo(req.user, req.body);
  audit(req, 'po.create', {
    entityType: 'PurchaseOrder',
    entityId: po.id,
    project: po.project?.id,
    summary: `Created purchase order ${po.poNumber} for ₹${po.grandTotal}`,
  });
  sendSuccess(res, po, { status: 201, message: 'Purchase order drafted' });
}

export async function updatePo(req, res) {
  const po = await service.updatePo(req.user, req.validated.params.id, req.body);
  audit(req, 'po.update', {
    entityType: 'PurchaseOrder',
    entityId: po.id,
    project: po.project?.id,
    summary: `Updated purchase order ${po.poNumber}`,
  });
  sendSuccess(res, po, { message: 'Purchase order updated' });
}

export async function transitionPo(req, res) {
  const po = await service.transitionPo(req.user, req.validated.params.id, req.body);
  audit(req, `po.${po.status}`, {
    entityType: 'PurchaseOrder',
    entityId: po.id,
    project: po.project?.id,
    summary: `Purchase order ${po.poNumber} transitioned to "${po.status}"`,
  });
  sendSuccess(res, po, { message: `Purchase order ${po.status}` });
}

/* GOODS RECEIPTS (GRN) */
export async function listGrns(req, res) {
  const { items, meta } = await service.listGrns(req.user, req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function getGrn(req, res) {
  sendSuccess(res, await service.getGrnById(req.user, req.validated.params.id));
}

export async function createGrn(req, res) {
  const grn = await service.createGrn(req.user, req.body);
  audit(req, 'grn.create', {
    entityType: 'GoodsReceipt',
    entityId: grn.id,
    project: grn.project?.id,
    summary: `Received goods ${grn.grnNumber} against ${grn.purchaseOrder?.poNumber}`,
  });
  sendSuccess(res, grn, { status: 201, message: 'Goods receipt recorded and stock updated' });
}

