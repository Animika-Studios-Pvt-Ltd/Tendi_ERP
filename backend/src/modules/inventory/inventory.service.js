import mongoose from 'mongoose';
import { InventoryTransaction, TRANSACTION_TYPES } from '../../models/InventoryTransaction.js';
import { Material } from '../../models/Material.js';
import { Project } from '../../models/Project.js';
import { Site } from '../../models/Site.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { paginate, parsePagination } from '../../utils/pagination.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';

const MATERIAL_SORT_FIELDS = ['createdAt', 'name', 'code', 'category', 'standardRate', 'reorderLevel'];
const TX_SORT_FIELDS = ['transactionDate', 'createdAt', 'quantity', 'type'];
const PERSON_SELECT = 'firstName lastName email';
const PROJECT_SELECT = 'code name';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fullName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ');

export function toMaterialDto(doc) {
  const m = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(m._id),
    code: m.code,
    name: m.name,
    category: m.category,
    unit: m.unit,
    hsnCode: m.hsnCode ?? '',
    standardRate: m.standardRate ?? 0,
    reorderLevel: m.reorderLevel ?? 0,
    description: m.description ?? '',
    isActive: m.isActive ?? true,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export function toTransactionDto(doc) {
  const tx = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(tx._id),
    transactionNumber: tx.transactionNumber,
    project: tx.project
      ? { id: String(tx.project._id || tx.project), code: tx.project.code ?? '', name: tx.project.name ?? '' }
      : null,
    site: tx.site ? { id: String(tx.site._id || tx.site), code: tx.site.code ?? '', name: tx.site.name ?? '' } : null,
    material: tx.material
      ? {
          id: String(tx.material._id || tx.material),
          code: tx.material.code ?? '',
          name: tx.material.name ?? '',
          unit: tx.material.unit ?? '',
          category: tx.material.category ?? '',
        }
      : null,
    type: tx.type,
    quantity: tx.quantity,
    delta: tx.delta,
    unitRate: tx.unitRate ?? 0,
    totalValue: tx.totalValue ?? 0,
    referenceType: tx.referenceType,
    referenceId: tx.referenceId ? String(tx.referenceId) : null,
    referenceNumber: tx.referenceNumber ?? '',
    transactionDate: tx.transactionDate,
    issuedTo: tx.issuedTo ?? '',
    remarks: tx.remarks ?? '',
    createdBy: tx.createdBy ? { id: String(tx.createdBy._id), fullName: fullName(tx.createdBy) } : null,
    createdAt: tx.createdAt,
  };
}

const scoped = (user, filter) => ({
  $and: [buildProjectScope(user, { projectField: 'project' }), filter],
});

/* =========================================================================
 * MATERIAL MASTER
 * ========================================================================= */

export async function listMaterials(query = {}) {
  const filter = {};
  if (query.category) filter.category = query.category;
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === true || query.isActive === 'true';
  }
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: pattern }, { code: pattern }, { category: pattern }, { hsnCode: pattern }];
  }

  const pagination = parsePagination(query, { allowedSortFields: MATERIAL_SORT_FIELDS, defaultSort: 'name' });
  const { items, meta } = await paginate(Material, filter, pagination);
  return { items: items.map(toMaterialDto), meta };
}

export async function getMaterialById(id) {
  const material = await Material.findById(id);
  if (!material) throw ApiError.notFound('Material not found');
  return toMaterialDto(material);
}

export async function createMaterial(user, input) {
  const existing = await Material.findOne({ code: input.code.toUpperCase() });
  if (existing) throw ApiError.conflict('A material with this code already exists');

  const material = await Material.create({
    ...input,
    code: input.code.toUpperCase(),
    createdBy: user._id,
    updatedBy: user._id,
  });

  return toMaterialDto(material);
}

export async function updateMaterial(user, id, input) {
  const material = await Material.findById(id);
  if (!material) throw ApiError.notFound('Material not found');

  Object.assign(material, input);
  material.updatedBy = user._id;
  await material.save();

  return toMaterialDto(material);
}

export async function deleteMaterial(id) {
  const material = await Material.findById(id);
  if (!material) throw ApiError.notFound('Material not found');

  const txCount = await InventoryTransaction.countDocuments({ material: material._id });
  if (txCount > 0) {
    throw ApiError.badRequest(
      `Cannot delete material with ${txCount} stock transactions. Deactivate it instead.`,
    );
  }

  await Material.findByIdAndDelete(id);
  return { id, code: material.code, name: material.name };
}

/* =========================================================================
 * STOCK TRANSACTIONS & LEDGER
 * ========================================================================= */

export async function getCurrentStock(projectId, materialId) {
  const res = await InventoryTransaction.aggregate([
    {
      $match: {
        project: new mongoose.Types.ObjectId(projectId),
        material: new mongoose.Types.ObjectId(materialId),
      },
    },
    { $group: { _id: null, balance: { $sum: '$delta' } } },
  ]);
  return res[0]?.balance ?? 0;
}

function computeDelta(type, quantity, direction) {
  switch (type) {
    case TRANSACTION_TYPES.OPENING:
    case TRANSACTION_TYPES.RECEIPT:
    case TRANSACTION_TYPES.RETURN:
    case TRANSACTION_TYPES.TRANSFER_IN:
      return quantity;
    case TRANSACTION_TYPES.ISSUE:
    case TRANSACTION_TYPES.TRANSFER_OUT:
      return -quantity;
    case TRANSACTION_TYPES.ADJUSTMENT:
      return direction === 'decrease' ? -quantity : quantity;
    default:
      throw ApiError.badRequest(`Unsupported transaction type: ${type}`);
  }
}

async function nextTxNumber(date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  return nextSequenceNumber('inventoryTx', {
    scopeKey: dateStr,
    contextCode: dateStr,
    prefixOverride: 'INV',
    minPadding: 4,
  });
}

export async function recordTransaction(user, input, { bypassAccessCheck = false } = {}) {
  if (!bypassAccessCheck && !canAccessProject(user, input.project)) {
    throw ApiError.forbidden('You do not have access to this project');
  }

  const [project, material] = await Promise.all([
    Project.findById(input.project),
    Material.findById(input.material),
  ]);

  if (!project) throw ApiError.notFound('Project not found');
  if (!material) throw ApiError.notFound('Material not found');

  if (input.site) {
    const site = await Site.findOne({ _id: input.site, project: project._id });
    if (!site) throw ApiError.badRequest('Selected site does not belong to this project');
  }

  const delta = computeDelta(input.type, input.quantity, input.direction);

  // Prevent negative stock for outflows
  if (delta < 0) {
    const current = await getCurrentStock(project._id, material._id);
    if (current + delta < 0) {
      throw ApiError.badRequest(
        `Insufficient stock for ${material.name} in ${project.code}. Available: ${current} ${material.unit}, Requested: ${input.quantity} ${material.unit}.`,
      );
    }
  }

  const unitRate = input.unitRate ?? material.standardRate ?? 0;
  const txDate = input.transactionDate ? new Date(input.transactionDate) : new Date();
  const txNumber = await nextTxNumber(txDate);

  const tx = await InventoryTransaction.create({
    transactionNumber: txNumber,
    project: project._id,
    site: input.site || undefined,
    material: material._id,
    type: input.type,
    quantity: input.quantity,
    delta,
    unitRate,
    totalValue: input.quantity * unitRate,
    referenceType: input.referenceType ?? 'Manual',
    referenceId: input.referenceId,
    referenceNumber: input.referenceNumber ?? '',
    transactionDate: txDate,
    issuedTo: input.issuedTo ?? '',
    remarks: input.remarks ?? '',
    createdBy: user._id,
  });

  await tx.populate([
    { path: 'project', select: PROJECT_SELECT },
    { path: 'site', select: 'code name' },
    { path: 'material', select: 'code name unit category' },
    { path: 'createdBy', select: PERSON_SELECT },
  ]);

  return toTransactionDto(tx);
}

export async function transferStock(user, input) {
  if (String(input.fromProject) === String(input.toProject) && String(input.fromSite || '') === String(input.toSite || '')) {
    throw ApiError.badRequest('Source and destination must be different');
  }

  if (!canAccessProject(user, input.fromProject) || !canAccessProject(user, input.toProject)) {
    throw ApiError.forbidden('You must have access to both source and destination projects');
  }

  const outTx = await recordTransaction(user, {
    project: input.fromProject,
    site: input.fromSite,
    material: input.material,
    type: TRANSACTION_TYPES.TRANSFER_OUT,
    quantity: input.quantity,
    referenceType: 'InterSiteTransfer',
    remarks: input.remarks || 'Inter-project stock transfer out',
  });

  const inTx = await recordTransaction(user, {
    project: input.toProject,
    site: input.toSite,
    material: input.material,
    type: TRANSACTION_TYPES.TRANSFER_IN,
    quantity: input.quantity,
    referenceType: 'InterSiteTransfer',
    referenceId: outTx.id,
    referenceNumber: outTx.transactionNumber,
    remarks: input.remarks || `Transfer received from ${outTx.project.code}`,
  });

  return { outTransaction: outTx, inTransaction: inTx };
}

export async function listTransactions(user, query = {}) {
  const filter = {};
  if (query.project) filter.project = query.project;
  if (query.site) filter.site = query.site;
  if (query.material) filter.material = query.material;
  if (query.type) filter.type = query.type;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ transactionNumber: pattern }, { referenceNumber: pattern }, { issuedTo: pattern }, { remarks: pattern }];
  }

  const pagination = parsePagination(query, { allowedSortFields: TX_SORT_FIELDS, defaultSort: '-transactionDate' });
  const { items, meta } = await paginate(InventoryTransaction, scoped(user, filter), pagination, {
    populate: [
      { path: 'project', select: PROJECT_SELECT },
      { path: 'site', select: 'code name' },
      { path: 'material', select: 'code name unit category' },
      { path: 'createdBy', select: PERSON_SELECT },
    ],
  });

  return { items: items.map(toTransactionDto), meta };
}

export async function getStockOverview(user, query = {}) {
  const scopeFilter = buildProjectScope(user, { projectField: 'project' });
  const match = { ...scopeFilter };

  if (query.project) {
    if (!canAccessProject(user, query.project)) {
      return [];
    }
    match.project = new mongoose.Types.ObjectId(query.project);
  }

  // Ensure ObjectIds in $in scope are converted properly for aggregate
  if (match.project && match.project.$in) {
    match.project.$in = match.project.$in.map((id) => new mongoose.Types.ObjectId(id));
  }

  const rows = await InventoryTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: { project: '$project', material: '$material' },
        currentStock: { $sum: '$delta' },
        totalIn: {
          $sum: { $cond: [{ $gt: ['$delta', 0] }, '$delta', 0] },
        },
        totalOut: {
          $sum: { $cond: [{ $lt: ['$delta', 0] }, { $abs: '$delta' }, 0] },
        },
        lastMovementAt: { $max: '$transactionDate' },
      },
    },
    {
      $lookup: {
        from: 'projects',
        localField: '_id.project',
        foreignField: '_id',
        as: 'projectDoc',
      },
    },
    {
      $lookup: {
        from: 'materials',
        localField: '_id.material',
        foreignField: '_id',
        as: 'materialDoc',
      },
    },
    { $unwind: '$projectDoc' },
    { $unwind: '$materialDoc' },
    { $sort: { 'projectDoc.code': 1, 'materialDoc.name': 1 } },
  ]);

  let formatted = rows.map((r) => {
    const mat = r.materialDoc;
    const proj = r.projectDoc;
    const stock = r.currentStock;
    const stockStatus =
      stock <= 0 ? 'out_of_stock' : stock <= (mat.reorderLevel ?? 0) ? 'low_stock' : 'in_stock';

    return {
      project: { id: String(proj._id), code: proj.code, name: proj.name },
      material: {
        id: String(mat._id),
        code: mat.code,
        name: mat.name,
        category: mat.category,
        unit: mat.unit,
        reorderLevel: mat.reorderLevel ?? 0,
        standardRate: mat.standardRate ?? 0,
      },
      currentStock: stock,
      totalIn: r.totalIn,
      totalOut: r.totalOut,
      stockValue: stock * (mat.standardRate ?? 0),
      stockStatus,
      lastMovementAt: r.lastMovementAt,
    };
  });

  if (query.category) {
    formatted = formatted.filter((item) => item.material.category === query.category);
  }
  if (query.lowStockOnly === 'true' || query.lowStockOnly === true) {
    formatted = formatted.filter((item) => item.stockStatus === 'low_stock' || item.stockStatus === 'out_of_stock');
  }
  if (query.q) {
    const qLower = query.q.toLowerCase();
    formatted = formatted.filter(
      (item) =>
        item.material.name.toLowerCase().includes(qLower) ||
        item.material.code.toLowerCase().includes(qLower) ||
        item.project.name.toLowerCase().includes(qLower),
    );
  }

  return formatted;
}

