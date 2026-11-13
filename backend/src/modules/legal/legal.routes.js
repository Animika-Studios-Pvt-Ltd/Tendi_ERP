import { Router } from 'express';
import { z } from 'zod';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { LegalAgreement, LegalDispute, PermitLicense } from '../../models/Legal.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { executeApprovalTransition } from '../../services/approval.service.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';

const { CREATE, READ, UPDATE, APPROVE, REJECT } = ACTIONS;
const can = (action) => authorize(MODULES.LEGAL, action);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');
const nullableId = z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null);
const text = (max) => z.string().trim().max(max);

function legalScope(user, projectField = 'project') {
  if (!user?.role || user.role.dataScope === 'all') return {};
  return { $or: [buildProjectScope(user, { projectField }), { [projectField]: null }] };
}

const createAgreementSchema = z.object({
  project: nullableId.optional(),
  partyType: z.enum(['client', 'vendor', 'contractor', 'other']).optional().default('contractor'),
  partyName: z.string().trim().min(2).max(160),
  title: z.string().trim().min(2).max(180),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().optional(),
  contractValue: z.coerce.number().min(0).optional().default(0),
  obligations: text(2000).optional().default(''),
});

const amendmentSchema = z.object({
  summary: z.string().trim().min(2).max(1000),
  valueDelta: z.coerce.number().optional().default(0),
});

const createPermitSchema = z.object({
  title: z.string().trim().min(2).max(180),
  recordType: z.enum(['permit', 'license', 'insurance']).optional().default('permit'),
  scope: z.enum(['company', 'project']).optional().default('project'),
  project: nullableId.optional(),
  authorityOrInsurer: z.string().trim().min(2).max(160),
  issueDate: z.string().optional(),
  expiryDate: z.string().min(1),
  coverageAmount: z.coerce.number().min(0).optional().default(0),
  notes: text(1000).optional().default(''),
});

const createDisputeSchema = z.object({
  project: nullableId.optional(),
  partyName: z.string().trim().min(2).max(160),
  disputeType: z.enum(['notice', 'claim', 'arbitration', 'litigation']).optional().default('notice'),
  title: z.string().trim().min(2).max(180),
  claimAmount: z.coerce.number().min(0).optional().default(0),
  summary: text(2000).optional().default(''),
});

const transitionSchema = z.object({
  status: z.enum(Object.values(APPROVAL_STATUS)),
  comment: text(500).optional().default(''),
});

const router = Router();
router.use(authenticate);

/* Agreements */
router.get('/agreements', can(READ), async (req, res) => {
  const rows = await LegalAgreement.find(legalScope(req.user))
    .populate('project', 'code name')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, rows.map((a) => ({ id: String(a._id), ...a })));
});

router.post('/agreements', can(CREATE), validate({ body: createAgreementSchema }), async (req, res) => {
  if (req.body.project && !canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const agreementNumber = await nextSequenceNumber('agreement', { prefixOverride: 'AGR', minPadding: 3 });
  const agr = await LegalAgreement.create({
    ...req.body,
    agreementNumber,
    effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : undefined,
    expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : undefined,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  sendSuccess(res, { id: String(agr._id), ...agr.toObject() }, { status: 201, message: `Agreement ${agreementNumber} drafted` });
});

router.post('/agreements/:id/amendments', can(UPDATE), validate({ params: z.object({ id: objectId }), body: amendmentSchema }), async (req, res) => {
  const agr = await LegalAgreement.findById(req.validated.params.id);
  if (!agr || (agr.project && !canAccessProject(req.user, agr.project))) throw ApiError.notFound('Agreement not found');
  const amendmentNo = (agr.amendments?.length ?? 0) + 1;
  agr.amendments.push({ amendmentNo, summary: req.body.summary, valueDelta: req.body.valueDelta, addedBy: req.user._id });
  agr.contractValue = Math.max(0, (agr.contractValue || 0) + (req.body.valueDelta || 0));
  agr.lifecycleStatus = 'amended';
  agr.updatedBy = req.user._id;
  await agr.save();
  sendSuccess(res, { id: String(agr._id), ...agr.toObject() }, { status: 201, message: `Amendment #${amendmentNo} added` });
});

router.post(
  '/agreements/:id/transition',
  authorize(MODULES.LEGAL, CREATE, UPDATE, APPROVE, REJECT),
  validate({ params: z.object({ id: objectId }), body: transitionSchema }),
  async (req, res) => {
    const agr = await LegalAgreement.findById(req.validated.params.id);
    if (!agr || (agr.project && !canAccessProject(req.user, agr.project))) throw ApiError.notFound('Agreement not found');
    await executeApprovalTransition(req.user, agr, { module: MODULES.LEGAL, targetStatus: req.body.status, comment: req.body.comment });
    if (req.body.status === APPROVAL_STATUS.APPROVED) agr.lifecycleStatus = 'active';
    agr.updatedBy = req.user._id;
    await agr.save();
    sendSuccess(res, { id: String(agr._id), ...agr.toObject() }, { message: `Agreement ${agr.status}` });
  },
);

/* Permits, Licences & Insurances + Expiring Alerts */
router.get('/permits', can(READ), async (req, res) => {
  const rows = await PermitLicense.find(legalScope(req.user)).populate('project', 'code name').sort({ expiryDate: 1 }).lean();
  sendSuccess(res, rows.map((p) => ({ id: String(p._id), ...p })));
});

router.post('/permits', can(CREATE), validate({ body: createPermitSchema }), async (req, res) => {
  if (req.body.project && !canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const permitNumber = await nextSequenceNumber('permit', { prefixOverride: 'PRM', minPadding: 3 });
  const expiryDate = new Date(req.body.expiryDate);
  const now = new Date();
  const daysLeft = (expiryDate.getTime() - now.getTime()) / 86400000;
  const status = daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring_soon' : 'active';
  const permit = await PermitLicense.create({
    ...req.body,
    permitNumber,
    issueDate: req.body.issueDate ? new Date(req.body.issueDate) : undefined,
    expiryDate,
    status,
    createdBy: req.user._id,
  });
  sendSuccess(res, { id: String(permit._id), ...permit.toObject() }, { status: 201, message: `Permit ${permitNumber} registered` });
});

router.get('/expiring', can(READ), async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const cutoff = new Date(Date.now() + days * 86400000);
  const rows = await PermitLicense.find({
    $and: [legalScope(req.user), { expiryDate: { $lte: cutoff } }],
  })
    .populate('project', 'code name')
    .sort({ expiryDate: 1 })
    .lean();
  sendSuccess(res, rows.map((p) => ({ id: String(p._id), ...p })));
});

/* Legal Disputes & Notices */
router.get('/disputes', can(READ), async (req, res) => {
  const rows = await LegalDispute.find(legalScope(req.user)).populate('project', 'code name').sort({ createdAt: -1 }).lean();
  sendSuccess(res, rows.map((d) => ({ id: String(d._id), ...d })));
});

router.post('/disputes', can(CREATE), validate({ body: createDisputeSchema }), async (req, res) => {
  if (req.body.project && !canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const caseNumber = await nextSequenceNumber('dispute', { prefixOverride: 'DSP', minPadding: 3 });
  const disp = await LegalDispute.create({ ...req.body, caseNumber, createdBy: req.user._id, updatedBy: req.user._id });
  sendSuccess(res, { id: String(disp._id), ...disp.toObject() }, { status: 201, message: `Case ${caseNumber} logged` });
});

export default router;

