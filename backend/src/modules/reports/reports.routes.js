import { Router } from 'express';
import mongoose from 'mongoose';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { ClientComplaint, ProjectHandover } from '../../models/Crm.js';
import { ContractorBill } from '../../models/Contractor.js';
import { Equipment, EquipmentLog } from '../../models/Equipment.js';
import { Expense, ProjectBudget } from '../../models/Finance.js';
import { AttendanceRecord } from '../../models/Hr.js';
import { InventoryTransaction } from '../../models/InventoryTransaction.js';
import { PermitLicense } from '../../models/Legal.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { Project } from '../../models/Project.js';
import { PurchaseOrder } from '../../models/PurchaseOrder.js';
import { NonConformanceReport, SafetyIncident } from '../../models/QualitySafety.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';

const canUser = (user, module, action = ACTIONS.READ) =>
  typeof user?.can === 'function' ? user.can(module, action) : Boolean(user?.role?.can?.(module, action));

const REPORT_CATALOG = [
  { key: 'project-progress', title: 'Project Schedule & Progress Report', module: MODULES.PROJECTS, category: 'Delivery' },
  { key: 'financial-variance', title: 'Budget vs Actual Financial Variance', module: MODULES.FINANCE, category: 'Commercial' },
  { key: 'procurement-summary', title: 'Procurement & Purchase Orders Report', module: MODULES.PROCUREMENT, category: 'Supply Chain' },
  { key: 'inventory-valuation', title: 'Inventory Stock & Valuation Report', module: MODULES.INVENTORY, category: 'Supply Chain' },
  { key: 'labour-attendance', title: 'HR & Site Labour Attendance Report', module: MODULES.HR, category: 'Workforce' },
  { key: 'contractor-billing', title: 'Contractor RA Billing & Retention Report', module: MODULES.CONTRACTORS, category: 'Commercial' },
  { key: 'equipment-utilization', title: 'Equipment Utilization & Maintenance Cost', module: MODULES.EQUIPMENT, category: 'Assets' },
  { key: 'quality-safety', title: 'Quality NCRs & Safety Incidents Report', module: MODULES.QUALITY_SAFETY, category: 'Governance' },
  { key: 'client-handover', title: 'Client Handover, Warranty & Complaints', module: MODULES.CRM, category: 'Clients' },
  { key: 'compliance-expiry', title: 'Legal Permits & Licence Expiry Register', module: MODULES.LEGAL, category: 'Governance' },
];

function csvEscapeCell(val) {
  const str = String(val ?? '').replace(/\r?\n/g, ' ');
  // Guard against CSV spreadsheet formula injection (=, +, -, @, tab, cr)
  const neutralized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

function toCsv(columns, rows) {
  const header = columns.map((c) => csvEscapeCell(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => csvEscapeCell(row[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}

async function runReport(user, key, { project } = {}) {
  const spec = REPORT_CATALOG.find((r) => r.key === key);
  if (!spec) throw ApiError.notFound('Report not found');
  if (!canUser(user, spec.module, ACTIONS.READ)) {
    throw ApiError.forbidden(`Access denied: missing read permission on "${spec.module}"`);
  }

  const childScope = buildProjectScope(user, { projectField: 'project' });
  const projScope = buildProjectScope(user, { projectField: '_id' });
  if (project && mongoose.isValidObjectId(project)) {
    if (!canAccessProject(user, project)) throw ApiError.forbidden('No access to project');
    childScope.project = new mongoose.Types.ObjectId(project);
    projScope._id = new mongoose.Types.ObjectId(project);
  }
  if (childScope.project?.$in) childScope.project.$in = childScope.project.$in.map((id) => new mongoose.Types.ObjectId(id));
  if (projScope._id?.$in) projScope._id.$in = projScope._id.$in.map((id) => new mongoose.Types.ObjectId(id));

  if (key === 'project-progress') {
    const items = await Project.find(projScope).sort({ code: 1 }).lean();
    return {
      spec,
      columns: [
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Project' },
        { key: 'status', label: 'Status' },
        { key: 'progressPercent', label: 'Progress %' },
        { key: 'contractValue', label: 'Contract Value' },
        { key: 'plannedEndDate', label: 'Planned End' },
      ],
      rows: items.map((p) => ({
        id: String(p._id),
        code: p.code,
        name: p.name,
        status: p.status,
        progressPercent: p.progressPercent ?? 0,
        contractValue: p.contractValue ?? 0,
        plannedEndDate: p.plannedEndDate ? new Date(p.plannedEndDate).toISOString().slice(0, 10) : '',
      })),
    };
  }

  if (key === 'financial-variance') {
    const [budgets, expenses] = await Promise.all([
      ProjectBudget.find(childScope).populate('project', 'code name contractValue').lean(),
      Expense.aggregate([
        { $match: { ...childScope, status: APPROVAL_STATUS.APPROVED } },
        { $group: { _id: '$project', total: { $sum: '$totalAmount' } } },
      ]),
    ]);
    const expMap = new Map(expenses.map((e) => [String(e._id), e.total]));
    return {
      spec,
      columns: [
        { key: 'projectCode', label: 'Project Code' },
        { key: 'projectName', label: 'Project' },
        { key: 'originalBudget', label: 'Original Budget' },
        { key: 'revisedBudget', label: 'Revised Budget' },
        { key: 'approvedExpenses', label: 'Approved Expenses' },
      ],
      rows: budgets.map((b) => ({
        id: String(b._id),
        projectCode: b.project?.code || '',
        projectName: b.project?.name || '',
        originalBudget: b.originalBudget ?? 0,
        revisedBudget: b.revisedBudget ?? 0,
        approvedExpenses: expMap.get(String(b.project?._id || b.project)) ?? 0,
      })),
    };
  }

  if (key === 'procurement-summary') {
    const pos = await PurchaseOrder.find(childScope).populate('project', 'code name').populate('vendor', 'name').sort({ poDate: -1 }).lean();
    return {
      spec,
      columns: [
        { key: 'poNumber', label: 'PO Number' },
        { key: 'project', label: 'Project' },
        { key: 'vendor', label: 'Vendor' },
        { key: 'status', label: 'Status' },
        { key: 'deliveryStatus', label: 'Delivery' },
        { key: 'grandTotal', label: 'Grand Total' },
      ],
      rows: pos.map((p) => ({
        id: String(p._id),
        poNumber: p.poNumber,
        project: p.project?.code || '',
        vendor: p.vendor?.name || '',
        status: p.status,
        deliveryStatus: p.deliveryStatus,
        grandTotal: p.grandTotal ?? 0,
      })),
    };
  }

  if (key === 'inventory-valuation') {
    const rows = await InventoryTransaction.aggregate([
      { $match: childScope },
      { $group: { _id: { project: '$project', material: '$material' }, balance: { $sum: '$delta' } } },
      { $lookup: { from: 'projects', localField: '_id.project', foreignField: '_id', as: 'p' } },
      { $lookup: { from: 'materials', localField: '_id.material', foreignField: '_id', as: 'm' } },
      { $unwind: '$p' },
      { $unwind: '$m' },
    ]);
    return {
      spec,
      columns: [
        { key: 'project', label: 'Project' },
        { key: 'materialCode', label: 'Material Code' },
        { key: 'materialName', label: 'Material' },
        { key: 'balance', label: 'Balance Qty' },
        { key: 'unit', label: 'Unit' },
        { key: 'stockValue', label: 'Valuation' },
      ],
      rows: rows.map((r) => ({
        id: `${r._id.project}-${r._id.material}`,
        project: r.p.code,
        materialCode: r.m.code,
        materialName: r.m.name,
        balance: r.balance,
        unit: r.m.unit,
        stockValue: Math.round(r.balance * (r.m.standardRate || 0) * 100) / 100,
      })),
    };
  }

  if (key === 'labour-attendance') {
    const logs = await AttendanceRecord.find(childScope).populate('employee', 'empCode fullName workerCategory').populate('project', 'code').sort({ date: -1 }).limit(100).lean();
    return {
      spec,
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'project', label: 'Project' },
        { key: 'empCode', label: 'Emp Code' },
        { key: 'fullName', label: 'Worker' },
        { key: 'category', label: 'Category' },
        { key: 'status', label: 'Status' },
      ],
      rows: logs.map((l) => ({
        id: String(l._id),
        date: new Date(l.date).toISOString().slice(0, 10),
        project: l.project?.code || '',
        empCode: l.employee?.empCode || '',
        fullName: l.employee?.fullName || '',
        category: l.employee?.workerCategory || '',
        status: l.status,
      })),
    };
  }

  if (key === 'contractor-billing') {
    const bills = await ContractorBill.find(childScope).populate('project', 'code').populate('contractor', 'companyName').sort({ billDate: -1 }).lean();
    return {
      spec,
      columns: [
        { key: 'billNumber', label: 'Bill No' },
        { key: 'project', label: 'Project' },
        { key: 'contractor', label: 'Contractor' },
        { key: 'grossCurrentBill', label: 'Gross Bill' },
        { key: 'retentionAmount', label: 'Retention' },
        { key: 'netPayable', label: 'Net Payable' },
        { key: 'status', label: 'Status' },
      ],
      rows: bills.map((b) => ({
        id: String(b._id),
        billNumber: b.billNumber,
        project: b.project?.code || '',
        contractor: b.contractor?.companyName || '',
        grossCurrentBill: b.grossCurrentBill,
        retentionAmount: b.retentionAmount,
        netPayable: b.netPayable,
        status: b.status,
      })),
    };
  }

  if (key === 'equipment-utilization') {
    const logs = await EquipmentLog.find(childScope).populate('equipment', 'code name').populate('project', 'code').sort({ logDate: -1 }).limit(100).lean();
    return {
      spec,
      columns: [
        { key: 'equipmentCode', label: 'Equipment Code' },
        { key: 'equipmentName', label: 'Equipment' },
        { key: 'project', label: 'Project' },
        { key: 'logType', label: 'Type' },
        { key: 'hoursOperated', label: 'Hours' },
        { key: 'totalCost', label: 'Operating/Maint Cost' },
      ],
      rows: logs.map((l) => ({
        id: String(l._id),
        equipmentCode: l.equipment?.code || '',
        equipmentName: l.equipment?.name || '',
        project: l.project?.code || '',
        logType: l.logType,
        hoursOperated: l.hoursOperated ?? 0,
        totalCost: (l.fuelCost || 0) + (l.maintenanceCost || 0) + (l.rentalCost || 0),
      })),
    };
  }

  if (key === 'quality-safety') {
    const [ncrs, incs] = await Promise.all([
      NonConformanceReport.find(childScope).populate('project', 'code').lean(),
      SafetyIncident.find(childScope).populate('project', 'code').lean(),
    ]);
    return {
      spec,
      columns: [
        { key: 'ref', label: 'Reference' },
        { key: 'kind', label: 'Type' },
        { key: 'project', label: 'Project' },
        { key: 'title', label: 'Title' },
        { key: 'severity', label: 'Severity' },
        { key: 'status', label: 'Status' },
      ],
      rows: [
        ...ncrs.map((n) => ({ id: String(n._id), ref: n.ncrNumber, kind: 'NCR', project: n.project?.code || '', title: n.title, severity: n.severity, status: n.status })),
        ...incs.map((i) => ({ id: String(i._id), ref: i.incidentNumber, kind: 'Safety', project: i.project?.code || '', title: i.title, severity: i.severity, status: i.status })),
      ],
    };
  }

  if (key === 'client-handover') {
    const [handovers, complaints] = await Promise.all([
      ProjectHandover.find(childScope).populate('project', 'code name').lean(),
      ClientComplaint.find(childScope).populate('project', 'code').lean(),
    ]);
    return {
      spec,
      columns: [
        { key: 'project', label: 'Project' },
        { key: 'type', label: 'Record' },
        { key: 'status', label: 'Status' },
        { key: 'summary', label: 'Details' },
      ],
      rows: [
        ...handovers.map((h) => ({ id: String(h._id), project: h.project?.code || '', type: 'Handover & Warranty', status: h.defectsLiabilityStatus, summary: `Warranty ${h.warrantyMonths}m · Snags cleared: ${h.snagsCleared}` })),
        ...complaints.map((c) => ({ id: String(c._id), project: c.project?.code || '', type: `Complaint ${c.complaintNumber}`, status: c.status, summary: c.subject })),
      ],
    };
  }

  // compliance-expiry
  const permits = await PermitLicense.find(user.role?.dataScope === 'all' ? {} : { $or: [childScope, { project: null }] })
    .populate('project', 'code name')
    .sort({ expiryDate: 1 })
    .lean();
  return {
    spec,
    columns: [
      { key: 'permitNumber', label: 'Permit No' },
      { key: 'title', label: 'Title' },
      { key: 'recordType', label: 'Type' },
      { key: 'project', label: 'Scope/Project' },
      { key: 'expiryDate', label: 'Expiry Date' },
      { key: 'status', label: 'Status' },
    ],
    rows: permits.map((p) => ({
      id: String(p._id),
      permitNumber: p.permitNumber,
      title: p.title,
      recordType: p.recordType,
      project: p.project?.code || 'Company',
      expiryDate: p.expiryDate ? new Date(p.expiryDate).toISOString().slice(0, 10) : '',
      status: p.status,
    })),
  };
}

const router = Router();
router.use(authenticate);

router.get('/catalog', authorize(MODULES.REPORTS, ACTIONS.READ), (req, res) => {
  const visible = REPORT_CATALOG.filter((r) => canUser(req.user, r.module, ACTIONS.READ));
  sendSuccess(res, visible);
});

router.get('/:key/export', authorize(MODULES.REPORTS, ACTIONS.READ), async (req, res) => {
  const result = await runReport(req.user, req.params.key, { project: req.query.project });
  const csv = toCsv(result.columns, result.rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.key}.csv"`);
  res.send(csv);
});

router.get('/:key', authorize(MODULES.REPORTS, ACTIONS.READ), async (req, res) => {
  const result = await runReport(req.user, req.params.key, { project: req.query.project });
  sendSuccess(res, result);
});

export default router;

