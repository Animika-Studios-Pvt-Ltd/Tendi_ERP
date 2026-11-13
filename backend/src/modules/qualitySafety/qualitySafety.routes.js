import { Router } from 'express';
import { z } from 'zod';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { NonConformanceReport, QualityInspection, SafetyIncident } from '../../models/QualitySafety.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';

const { CREATE, READ, UPDATE } = ACTIONS;
const can = (action) => authorize(MODULES.QUALITY_SAFETY, action);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');
const nullableId = z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null);
const text = (max) => z.string().trim().max(max);

const createInspectionSchema = z.object({
  project: objectId,
  site: nullableId.optional(),
  workPackage: text(120).optional().default(''),
  title: z.string().trim().min(2).max(180),
  inspectionType: z.enum(['material', 'workmanship', 'structural', 'finishing', 'mep']).optional().default('structural'),
  checklistItems: z
    .array(z.object({ label: z.string().trim().min(1), status: z.enum(['pass', 'fail', 'na']).default('pass'), remarks: text(300).optional().default('') }))
    .optional()
    .default([]),
  notes: text(1000).optional().default(''),
});

const createNcrSchema = z.object({
  project: objectId,
  site: nullableId.optional(),
  title: z.string().trim().min(2).max(180),
  description: text(2000).optional().default(''),
  severity: z.enum(['minor', 'major', 'critical']).optional().default('major'),
  category: text(80).optional().default('Workmanship'),
  rootCause: text(1000).optional().default(''),
  correctiveAction: text(1000).optional().default(''),
  dueDate: z.string().optional(),
  assignedTo: nullableId.optional(),
});

const updateNcrSchema = createNcrSchema.partial().omit({ project: true }).extend({
  status: z.enum(['open', 'in_progress', 'rectified', 'verified', 'closed']).optional(),
});

const createIncidentSchema = z.object({
  project: objectId,
  site: nullableId.optional(),
  incidentType: z.enum(['near_miss', 'first_aid', 'medical_treatment', 'lti', 'property_damage', 'toolbox_talk']).optional().default('near_miss'),
  title: z.string().trim().min(2).max(180),
  description: text(2000).optional().default(''),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional().default('low'),
  injuredPerson: text(120).optional().default(''),
  attendeesCount: z.coerce.number().min(0).optional().default(0),
  ppeCompliant: z.boolean().optional().default(true),
  correctiveAction: text(1000).optional().default(''),
});

const updateIncidentSchema = createIncidentSchema.partial().omit({ project: true }).extend({
  status: z.enum(['open', 'investigating', 'closed']).optional(),
});

const router = Router();
router.use(authenticate);

/* Quality Inspections */
router.get('/inspections', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const filter = req.query.project ? { $and: [scope, { project: req.query.project }] } : scope;
  const rows = await QualityInspection.find(filter)
    .populate('project', 'code name')
    .populate('site', 'code name')
    .populate('inspector', 'firstName lastName')
    .sort({ inspectedAt: -1 })
    .lean();
  sendSuccess(res, rows.map((i) => ({ id: String(i._id), ...i })));
});

router.post('/inspections', can(CREATE), validate({ body: createInspectionSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const failed = req.body.checklistItems.some((c) => c.status === 'fail');
  const inspectionNumber = await nextSequenceNumber('inspection', { prefixOverride: 'QIN', minPadding: 3 });
  const insp = await QualityInspection.create({
    ...req.body,
    inspectionNumber,
    overallResult: failed ? 'fail' : 'pass',
    inspector: req.user._id,
  });
  await insp.populate('project site inspector');
  sendSuccess(res, { id: String(insp._id), ...insp.toObject() }, { status: 201, message: `Inspection ${inspectionNumber} logged` });
});

/* NCR & Punch List / Defects */
router.get('/ncrs', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const filter = { ...scope };
  if (req.query.project) filter.project = req.query.project;
  if (req.query.status) filter.status = req.query.status;
  const rows = await NonConformanceReport.find(filter)
    .populate('project', 'code name')
    .populate('site', 'code name')
    .populate('assignedTo createdBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, rows.map((n) => ({ id: String(n._id), ...n })));
});

router.post('/ncrs', can(CREATE), validate({ body: createNcrSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const ncrNumber = await nextSequenceNumber('ncr', { prefixOverride: 'NCR', minPadding: 3 });
  const ncr = await NonConformanceReport.create({
    ...req.body,
    ncrNumber,
    dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await ncr.populate('project site');
  sendSuccess(res, { id: String(ncr._id), ...ncr.toObject() }, { status: 201, message: `NCR ${ncrNumber} raised` });
});

router.patch('/ncrs/:id', can(UPDATE), validate({ params: z.object({ id: objectId }), body: updateNcrSchema }), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const ncr = await NonConformanceReport.findOne({ $and: [scope, { _id: req.validated.params.id }] });
  if (!ncr) throw ApiError.notFound('NCR not found');
  Object.assign(ncr, req.body);
  if (req.body.dueDate) ncr.dueDate = new Date(req.body.dueDate);
  ncr.updatedBy = req.user._id;
  await ncr.save();
  sendSuccess(res, { id: String(ncr._id), ...ncr.toObject() }, { message: 'NCR updated' });
});

/* Safety Incidents & Toolbox Talks */
router.get('/incidents', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const filter = req.query.project ? { $and: [scope, { project: req.query.project }] } : scope;
  const rows = await SafetyIncident.find(filter)
    .populate('project', 'code name')
    .populate('site', 'code name')
    .populate('reportedBy', 'firstName lastName')
    .sort({ incidentDate: -1 })
    .lean();
  sendSuccess(res, rows.map((s) => ({ id: String(s._id), ...s })));
});

router.post('/incidents', can(CREATE), validate({ body: createIncidentSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const incidentNumber = await nextSequenceNumber('incident', { prefixOverride: 'SAF', minPadding: 3 });
  const inc = await SafetyIncident.create({
    ...req.body,
    incidentNumber,
    reportedBy: req.user._id,
    updatedBy: req.user._id,
  });
  await inc.populate('project site reportedBy');
  sendSuccess(res, { id: String(inc._id), ...inc.toObject() }, { status: 201, message: `Safety record ${incidentNumber} logged` });
});

router.patch('/incidents/:id', can(UPDATE), validate({ params: z.object({ id: objectId }), body: updateIncidentSchema }), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const inc = await SafetyIncident.findOne({ $and: [scope, { _id: req.validated.params.id }] });
  if (!inc) throw ApiError.notFound('Safety record not found');
  Object.assign(inc, req.body);
  inc.updatedBy = req.user._id;
  await inc.save();
  sendSuccess(res, { id: String(inc._id), ...inc.toObject() }, { message: 'Safety record updated' });
});

export default router;

