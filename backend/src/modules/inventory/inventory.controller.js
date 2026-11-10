import { MODULES } from '../../config/rbac.js';
import { recordAudit } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as service from './inventory.service.js';

const audit = (req, action, extra = {}) =>
  recordAudit(req, {
    action,
    module: MODULES.INVENTORY,
    ...extra,
  });

/* MATERIALS */

export async function listMaterials(req, res) {
  const { items, meta } = await service.listMaterials(req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function getMaterial(req, res) {
  const material = await service.getMaterialById(req.validated.params.id);
  sendSuccess(res, material);
}

export async function createMaterial(req, res) {
  const material = await service.createMaterial(req.user, req.body);
  audit(req, 'material.create', {
    entityType: 'Material',
    entityId: material.id,
    summary: `Created material ${material.code} (${material.name})`,
  });
  sendSuccess(res, material, { status: 201, message: 'Material created successfully' });
}

export async function updateMaterial(req, res) {
  const material = await service.updateMaterial(req.user, req.validated.params.id, req.body);
  audit(req, 'material.update', {
    entityType: 'Material',
    entityId: material.id,
    summary: `Updated material ${material.code} (${material.name})`,
  });
  sendSuccess(res, material, { message: 'Material updated successfully' });
}

export async function deleteMaterial(req, res) {
  const result = await service.deleteMaterial(req.validated.params.id);
  audit(req, 'material.delete', {
    entityType: 'Material',
    entityId: result.id,
    summary: `Deleted material ${result.code}`,
  });
  sendSuccess(res, null, { message: 'Material deleted successfully' });
}

/* STOCK & TRANSACTIONS */

export async function getStockOverview(req, res) {
  const items = await service.getStockOverview(req.user, req.validated.query);
  sendSuccess(res, items);
}

export async function listTransactions(req, res) {
  const { items, meta } = await service.listTransactions(req.user, req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function recordTransaction(req, res) {
  const tx = await service.recordTransaction(req.user, req.body);
  audit(req, `inventory.${tx.type}`, {
    entityType: 'InventoryTransaction',
    entityId: tx.id,
    project: tx.project?.id,
    summary: `Recorded ${tx.type} of ${tx.quantity} ${tx.material?.unit} for ${tx.material?.name}`,
  });
  sendSuccess(res, tx, { status: 201, message: 'Stock movement recorded' });
}

export async function transferStock(req, res) {
  const result = await service.transferStock(req.user, req.body);
  audit(req, 'inventory.transfer', {
    entityType: 'InventoryTransaction',
    entityId: result.outTransaction.id,
    project: result.outTransaction.project?.id,
    summary: `Transferred ${req.body.quantity} ${result.outTransaction.material?.unit} from ${result.outTransaction.project?.code} to ${result.inTransaction.project?.code}`,
  });
  sendSuccess(res, result, { status: 201, message: 'Stock transferred successfully' });
}

