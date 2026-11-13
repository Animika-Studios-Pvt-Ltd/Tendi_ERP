import { Router } from 'express';
import { z } from 'zod';
import { ACTIONS, DATA_SCOPES, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { Client, ClientComplaint, Enquiry, ProjectHandover } from '../../models/Crm.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { buildOwnershipScope, buildProjectScope, canAccessProject } from '../../utils/scope.js';

const { CREATE, READ, UPDATE } = ACTIONS;
const can = (action) => authorize(MODULES.CRM, action);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');
const nullableId = z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null);
const text = (max) => z.string().trim().max(max);

function crmScope(user) {
  if (!user?.role || user.role.dataScope === DATA_SCOPES.ALL) return {};
  if (user.role.dataScope === DATA_SCOPES.OWN) {
    return buildOwnershipScope(user, { projectField: 'project', ownerField: 'client', ownerValue: user.customer });
  }
  return buildProjectScope(user, { projectField: 'project' });
}

const createClientSchema = z.object({
  name: z.string().trim().min(2).max(150),
  contactPerson: text(120).optional().default(''),
  email: text(120).optional().default(''),
  phone: text(20).optional().default(''),
  gstin: text(20).optional().default(''),
  address: text(300).optional().default(''),
  city: text(80).optional().default(''),
});

const createEnquirySchema = z.object({
  client: nullableId.optional(),
  clientName: z.string().trim().min(2).max(150),
  title: z.string().trim().min(2).max(180),
  location: text(160).optional().default(''),
  estimatedValue: z.coerce.number().min(0).optional().default(0),
  stage: z.enum(['new', 'site_visit', 'proposal', 'negotiation', 'won', 'lost']).optional().default('new'),
  estimateRef: nullableId.optional(),
  projectRef: nullableId.optional(),
  notes: text(2000).optional().default(''),
});

const createComplaintSchema = z.object({
  project: objectId,
  client: nullableId.optional(),
  subject: z.string().trim().min(2).max(180),
  description: text(2000).optional().default(''),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
});

const createHandoverSchema = z.object({
  project: objectId,
  client: nullableId.optional(),
  handoverDate: z.string().optional(),
  warrantyMonths: z.coerce.number().int().min(0).max(120).optional().default(12),
  snagsCleared: z.boolean().optional().default(false),
  certificatesIssued: z.boolean().optional().default(false),
  notes: text(1000).optional().default(''),
});

const router = Router();
router.use(authenticate);

/* Clients */
router.get('/clients', can(READ), async (req, res) => {
  const filter =
    req.user.role?.dataScope === DATA_SCOPES.OWN && req.user.customer
      ? { _id: req.user.customer }
      : {};
  const rows = await Client.find(filter).sort({ name: 1 }).lean();
  sendSuccess(res, rows.map((c) => ({ id: String(c._id), ...c })));
});

router.post('/clients', can(CREATE), validate({ body: createClientSchema }), async (req, res) => {
  const code = await nextSequenceNumber('client', { prefixOverride: 'CLN', minPadding: 3 });
  const c = await Client.create({ ...req.body, code, createdBy: req.user._id });
  sendSuccess(res, { id: String(c._id), ...c.toObject() }, { status: 201, message: 'Client created' });
});

/* Enquiries & Pipeline */
router.get('/enquiries', can(READ), async (req, res) => {
  const filter =
    req.user.role?.dataScope === DATA_SCOPES.OWN && req.user.customer
      ? { client: req.user.customer }
      : {};
  const rows = await Enquiry.find(filter)
    .populate('client', 'code name')
    .populate('estimateRef', 'estimateNumber quotedTotal status')
    .populate('projectRef', 'code name')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, rows.map((e) => ({ id: String(e._id), ...e })));
});

router.post('/enquiries', can(CREATE), validate({ body: createEnquirySchema }), async (req, res) => {
  const enquiryNumber = await nextSequenceNumber('enquiry', { prefixOverride: 'ENQ', minPadding: 3 });
  const enq = await Enquiry.create({ ...req.body, enquiryNumber, owner: req.user._id, createdBy: req.user._id });
  sendSuccess(res, { id: String(enq._id), ...enq.toObject() }, { status: 201, message: `Enquiry ${enquiryNumber} logged` });
});

router.patch('/enquiries/:id', can(UPDATE), validate({ params: z.object({ id: objectId }), body: createEnquirySchema.partial() }), async (req, res) => {
  const enq = await Enquiry.findByIdAndUpdate(req.validated.params.id, { $set: req.body }, { returnDocument: 'after' });
  if (!enq) throw ApiError.notFound('Enquiry not found');
  sendSuccess(res, { id: String(enq._id), ...enq.toObject() }, { message: 'Enquiry updated' });
});

/* Complaints */
router.get('/complaints', can(READ), async (req, res) => {
  const scope = crmScope(req.user);
  const rows = await ClientComplaint.find(scope)
    .populate('project', 'code name')
    .populate('client', 'code name')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, rows.map((c) => ({ id: String(c._id), ...c })));
});

router.post('/complaints', can(CREATE), validate({ body: createComplaintSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const complaintNumber = await nextSequenceNumber('complaint', { prefixOverride: 'CMP', minPadding: 3 });
  const cmp = await ClientComplaint.create({
    ...req.body,
    complaintNumber,
    client: req.body.client || req.user.customer || null,
    createdBy: req.user._id,
  });
  sendSuccess(res, { id: String(cmp._id), ...cmp.toObject() }, { status: 201, message: `Complaint ${complaintNumber} logged` });
});

router.patch('/complaints/:id', can(UPDATE), validate({ params: z.object({ id: objectId }), body: z.object({ status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(), resolution: text(1000).optional() }) }), async (req, res) => {
  const cmp = await ClientComplaint.findOne({ $and: [crmScope(req.user), { _id: req.validated.params.id }] });
  if (!cmp) throw ApiError.notFound('Complaint not found');
  Object.assign(cmp, req.body);
  await cmp.save();
  sendSuccess(res, { id: String(cmp._id), ...cmp.toObject() }, { message: 'Complaint updated' });
});

/* Handover & Warranty */
router.get('/handovers', can(READ), async (req, res) => {
  const rows = await ProjectHandover.find(crmScope(req.user))
    .populate('project', 'code name status')
    .populate('client', 'code name')
    .sort({ handoverDate: -1 })
    .lean();
  sendSuccess(res, rows.map((h) => ({ id: String(h._id), ...h })));
});

router.post('/handovers', can(CREATE), validate({ body: createHandoverSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const handoverDate = req.body.handoverDate ? new Date(req.body.handoverDate) : new Date();
  const warrantyEndDate = new Date(handoverDate);
  warrantyEndDate.setMonth(warrantyEndDate.getMonth() + (req.body.warrantyMonths ?? 12));
  const ho = await ProjectHandover.findOneAndUpdate(
    { project: req.body.project },
    {
      $set: {
        ...req.body,
        handoverDate,
        warrantyEndDate,
        createdBy: req.user._id,
      },
    },
    { returnDocument: 'after', upsert: true },
  );
  sendSuccess(res, { id: String(ho._id), ...ho.toObject() }, { status: 201, message: 'Handover & warranty record saved' });
});

export default router;

