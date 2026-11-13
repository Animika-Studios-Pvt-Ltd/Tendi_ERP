import { Router } from 'express';
import mongoose from 'mongoose';
import { MODULES, ROLES } from '../../config/rbac.js';
import { authenticate } from '../../middleware/auth.js';
import { ChangeOrder } from '../../models/ChangeOrder.js';
import { CompanySettings } from '../../models/CompanySettings.js';
import { ContractorBill } from '../../models/Contractor.js';
import { DailyProgressReport } from '../../models/DailyProgressReport.js';
import { Estimate } from '../../models/Estimate.js';
import { Expense } from '../../models/Finance.js';
import { LeaveRequest, PayrollRun } from '../../models/Hr.js';
import { MaterialRequest } from '../../models/MaterialRequest.js';
import { Notification } from '../../models/Notification.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { PurchaseOrder } from '../../models/PurchaseOrder.js';
import { StockVerification } from '../../models/Warehouse.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { paginate, parsePagination } from '../../utils/pagination.js';
import { buildProjectScope } from '../../utils/scope.js';

const router = Router();
router.use(authenticate);

const canUser = (user, module, action) =>
  typeof user?.can === 'function' ? user.can(module, action) : Boolean(user?.role?.can?.(module, action));

const isAdmin = (user) => [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN].includes(user?.role?.key);

router.get('/', async (req, res) => {
  const pagination = parsePagination(req.query, {
    allowedSortFields: ['createdAt', 'isRead'],
    defaultSort: '-createdAt',
  });
  const filter = { recipient: req.user._id };
  if (req.query.unreadOnly === 'true') filter.isRead = false;

  const [{ items, meta }, unreadCount] = await Promise.all([
    paginate(Notification, filter, pagination, {
      populate: { path: 'project', select: 'code name' },
    }),
    Notification.countDocuments({ recipient: req.user._id, isRead: false }),
  ]);

  const data = items.map((n) => ({
    id: String(n._id),
    type: n.type,
    title: n.title,
    message: n.message ?? '',
    module: n.module ?? '',
    entityType: n.entityType ?? '',
    entityId: n.entityId ? String(n.entityId) : null,
    project: n.project ? { id: String(n.project._id), code: n.project.code, name: n.project.name } : null,
    link: n.link ?? '',
    isRead: Boolean(n.isRead),
    readAt: n.readAt ?? null,
    createdAt: n.createdAt,
  }));

  sendSuccess(res, data, { meta: { ...meta, unreadCount } });
});

router.get('/pending-approvals', async (req, res) => {
  const user = req.user;
  const pendingStatuses = [APPROVAL_STATUS.SUBMITTED, APPROVAL_STATUS.UNDER_REVIEW];
  const scope = buildProjectScope(user, { projectField: 'project' });
  const admin = isAdmin(user);
  const makerFilter = admin ? {} : { submittedBy: { $ne: user._id } };

  const settings = await CompanySettings.getSettings();
  const poRule = settings?.approvalLimits?.find((l) => l.module === MODULES.PROCUREMENT);
  const poLimitFilter =
    !admin && poRule?.requireAdminAboveLimit ? { grandTotal: { $lte: poRule.pmLimit } } : {};

  const tasks = [];

  if (canUser(user, MODULES.ESTIMATION, 'approve')) {
    const estScope = admin ? {} : { $or: [scope, { project: null }] };
    tasks.push(
      Estimate.find({ $and: [estScope, makerFilter, { status: { $in: pendingStatuses } }] })
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(10)
        .populate('project', 'code name')
        .populate('submittedBy', 'firstName lastName')
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: String(r._id),
            module: MODULES.ESTIMATION,
            type: 'Estimate',
            reference: r.estimateNumber,
            title: `${r.estimateNumber} · ${r.title}`,
            project: r.project ? `${r.project.code} · ${r.project.name}` : r.client?.name || 'Pre-project Enquiry',
            requestedBy: r.submittedBy ? [r.submittedBy.firstName, r.submittedBy.lastName].filter(Boolean).join(' ') : '',
            amount: r.quotedTotal ?? null,
            status: r.status,
            submittedAt: r.submittedAt || r.createdAt,
            link: `/estimation/${r._id}`,
          })),
        ),
    );
  }

  if (canUser(user, MODULES.PROJECTS, 'approve')) {
    tasks.push(
      ChangeOrder.find({ $and: [scope, makerFilter, { status: { $in: pendingStatuses } }] })
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(10)
        .populate('project', 'code name')
        .populate('submittedBy', 'firstName lastName')
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: String(r._id),
            module: MODULES.PROJECTS,
            type: 'Change Order',
            reference: r.changeNumber,
            title: `${r.changeNumber} · ${r.title}`,
            project: r.project ? `${r.project.code} · ${r.project.name}` : '',
            requestedBy: r.submittedBy ? [r.submittedBy.firstName, r.submittedBy.lastName].filter(Boolean).join(' ') : '',
            amount: r.costImpact ?? null,
            status: r.status,
            submittedAt: r.submittedAt || r.createdAt,
            link: `/projects/${r.project?._id || r.project}`,
          })),
        ),
    );
  }

  if (canUser(user, MODULES.SITES, 'approve')) {
    tasks.push(
      DailyProgressReport.find({ $and: [scope, makerFilter, { status: { $in: pendingStatuses } }] })
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(10)
        .populate('project', 'code name')
        .populate('site', 'code name')
        .populate('submittedBy', 'firstName lastName')
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: String(r._id),
            module: MODULES.SITES,
            type: 'Daily Progress Report',
            reference: r.reportNumber,
            title: `${r.reportNumber} · ${r.site?.name || 'Site'}`,
            project: r.project ? `${r.project.code} · ${r.project.name}` : '',
            requestedBy: r.submittedBy ? [r.submittedBy.firstName, r.submittedBy.lastName].filter(Boolean).join(' ') : '',
            amount: null,
            status: r.status,
            submittedAt: r.submittedAt || r.createdAt,
            link: `/sites/daily-progress/${r._id}`,
          })),
        ),
    );
  }

  if (canUser(user, MODULES.PROCUREMENT, 'approve')) {
    tasks.push(
      MaterialRequest.find({ $and: [scope, makerFilter, { status: { $in: pendingStatuses } }] })
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(10)
        .populate('project', 'code name')
        .populate('submittedBy', 'firstName lastName')
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: String(r._id),
            module: MODULES.PROCUREMENT,
            type: 'Material Request',
            reference: r.requestNumber,
            title: `${r.requestNumber} (${r.items?.length || 0} items)`,
            project: r.project ? `${r.project.code} · ${r.project.name}` : '',
            requestedBy: r.submittedBy ? [r.submittedBy.firstName, r.submittedBy.lastName].filter(Boolean).join(' ') : '',
            amount: null,
            status: r.status,
            submittedAt: r.submittedAt || r.createdAt,
            link: '/procurement',
          })),
        ),
    );

    tasks.push(
      PurchaseOrder.find({ $and: [scope, makerFilter, poLimitFilter, { status: { $in: pendingStatuses } }] })
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(10)
        .populate('project', 'code name')
        .populate('vendor', 'name')
        .populate('submittedBy', 'firstName lastName')
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: String(r._id),
            module: MODULES.PROCUREMENT,
            type: 'Purchase Order',
            reference: r.poNumber,
            title: `${r.poNumber} · ${r.vendor?.name || 'Vendor'}`,
            project: r.project ? `${r.project.code} · ${r.project.name}` : '',
            requestedBy: r.submittedBy ? [r.submittedBy.firstName, r.submittedBy.lastName].filter(Boolean).join(' ') : '',
            amount: r.grandTotal ?? null,
            status: r.status,
            submittedAt: r.submittedAt || r.createdAt,
            link: '/procurement/purchase-orders',
          })),
        ),
    );
  }

  if (canUser(user, MODULES.FINANCE, 'approve')) {
    const finRule = settings?.approvalLimits?.find((l) => l.module === MODULES.FINANCE);
    const finFilter = !admin && finRule?.requireAdminAboveLimit ? { totalAmount: { $lte: finRule.pmLimit } } : {};
    tasks.push(
      Expense.find({ $and: [scope, makerFilter, finFilter, { status: { $in: pendingStatuses } }] })
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(8)
        .populate('project', 'code name')
        .populate('submittedBy', 'firstName lastName')
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: String(r._id),
            module: MODULES.FINANCE,
            type: 'Expense',
            reference: r.expenseNumber,
            title: `${r.expenseNumber} · ${r.description}`,
            project: r.project ? `${r.project.code} · ${r.project.name}` : '',
            requestedBy: r.submittedBy ? [r.submittedBy.firstName, r.submittedBy.lastName].filter(Boolean).join(' ') : '',
            amount: r.totalAmount ?? null,
            status: r.status,
            submittedAt: r.submittedAt || r.createdAt,
            link: '/finance/expenses',
          })),
        ),
    );
  }

  if (canUser(user, MODULES.CONTRACTORS, 'approve')) {
    const conRule = settings?.approvalLimits?.find((l) => l.module === MODULES.CONTRACTORS);
    const conFilter = !admin && conRule?.requireAdminAboveLimit ? { netPayable: { $lte: conRule.pmLimit } } : {};
    tasks.push(
      ContractorBill.find({ $and: [scope, makerFilter, conFilter, { status: { $in: pendingStatuses } }] })
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(8)
        .populate('project', 'code name')
        .populate('contractor', 'companyName')
        .populate('submittedBy', 'firstName lastName')
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: String(r._id),
            module: MODULES.CONTRACTORS,
            type: 'Contractor Bill',
            reference: r.billNumber,
            title: `${r.billNumber} · ${r.contractor?.companyName || 'Contractor'}`,
            project: r.project ? `${r.project.code} · ${r.project.name}` : '',
            requestedBy: r.submittedBy ? [r.submittedBy.firstName, r.submittedBy.lastName].filter(Boolean).join(' ') : '',
            amount: r.netPayable ?? null,
            status: r.status,
            submittedAt: r.submittedAt || r.createdAt,
            link: '/contractors/bills',
          })),
        ),
    );
  }

  if (canUser(user, MODULES.INVENTORY, 'approve')) {
    tasks.push(
      StockVerification.find({ $and: [scope, makerFilter, { status: { $in: pendingStatuses } }] })
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(5)
        .populate('project', 'code name')
        .populate('submittedBy', 'firstName lastName')
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: String(r._id),
            module: MODULES.INVENTORY,
            type: 'Stock Verification',
            reference: r.verificationNumber,
            title: `${r.verificationNumber}`,
            project: r.project ? `${r.project.code} · ${r.project.name}` : '',
            requestedBy: r.submittedBy ? [r.submittedBy.firstName, r.submittedBy.lastName].filter(Boolean).join(' ') : '',
            amount: null,
            status: r.status,
            submittedAt: r.submittedAt || r.createdAt,
            link: '/inventory',
          })),
        ),
    );
  }

  if (canUser(user, MODULES.HR, 'approve')) {
    tasks.push(
      PayrollRun.find({ $and: [scope, makerFilter, { status: { $in: pendingStatuses } }] })
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(5)
        .populate('project', 'code name')
        .populate('submittedBy', 'firstName lastName')
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: String(r._id),
            module: MODULES.HR,
            type: 'Payroll Run',
            reference: r.runNumber,
            title: `${r.runNumber} · ${r.month}`,
            project: r.project ? `${r.project.code} · ${r.project.name}` : '',
            requestedBy: r.submittedBy ? [r.submittedBy.firstName, r.submittedBy.lastName].filter(Boolean).join(' ') : '',
            amount: r.totalNet ?? null,
            status: r.status,
            submittedAt: r.submittedAt || r.createdAt,
            link: '/hr/payroll',
          })),
        ),
      LeaveRequest.find({ $and: [makerFilter, { status: { $in: pendingStatuses } }] })
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(5)
        .populate('employee', 'fullName')
        .lean()
        .then((rows) =>
          rows.map((r) => ({
            id: String(r._id),
            module: MODULES.HR,
            type: 'Leave Request',
            reference: r.leaveType,
            title: `${r.employee?.fullName || 'Worker'} · ${r.leaveType}`,
            project: '',
            requestedBy: r.employee?.fullName || '',
            amount: null,
            status: r.status,
            submittedAt: r.submittedAt || r.createdAt,
            link: '/hr/leave',
          })),
        ),
    );
  }

  const groups = await Promise.all(tasks);
  const items = groups
    .flat()
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    .slice(0, 20);

  sendSuccess(res, items, { meta: { total: items.length } });
});

router.patch('/:id/read', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Notification not found');

  const doc = await Notification.findOneAndUpdate(
    { _id: id, recipient: req.user._id },
    { $set: { isRead: true, readAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!doc) throw ApiError.notFound('Notification not found');
  sendSuccess(res, { id: String(doc._id), isRead: true, readAt: doc.readAt });
});

router.post('/read-all', async (req, res) => {
  const result = await Notification.updateMany(
    { recipient: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  sendSuccess(res, { updated: result.modifiedCount ?? 0 });
});

export default router;
