import { Router } from 'express';
import { z } from 'zod';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { Equipment, EquipmentLog } from '../../models/Equipment.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';

const { CREATE, READ, UPDATE } = ACTIONS;
const can = (action) => authorize(MODULES.EQUIPMENT, action);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');
const nullableId = z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null);
const text = (max) => z.string().trim().max(max);

const createEquipmentSchema = z.object({
  name: z.string().trim().min(2).max(140),
  category: text(80).optional().default('Heavy Machinery'),
  ownershipType: z.enum(['owned', 'rented', 'leased']).optional().default('owned'),
  vendorRef: nullableId.optional(),
  dailyRate: z.coerce.number().min(0).optional().default(0),
  hourlyRate: z.coerce.number().min(0).optional().default(0),
  project: nullableId.optional(),
  site: nullableId.optional(),
  assignedOperator: text(120).optional().default(''),
  nextServiceDueDate: z.string().optional(),
  notes: text(500).optional().default(''),
});

const updateEquipmentSchema = createEquipmentSchema.partial().extend({
  status: z.enum(['available', 'deployed', 'maintenance', 'retired']).optional(),
});

const createLogSchema = z.object({
  equipment: objectId,
  project: objectId,
  site: nullableId.optional(),
  logType: z.enum(['usage', 'fuel', 'maintenance', 'breakdown']).optional().default('usage'),
  hoursOperated: z.coerce.number().min(0).max(24).optional().default(0),
  fuelLiters: z.coerce.number().min(0).optional().default(0),
  fuelCost: z.coerce.number().min(0).optional().default(0),
  maintenanceCost: z.coerce.number().min(0).optional().default(0),
  rentalCost: z.coerce.number().min(0).optional().default(0),
  operatorName: text(120).optional().default(''),
  maintenanceType: z.enum(['preventive', 'breakdown', 'none']).optional().default('none'),
  description: text(500).optional().default(''),
  resolved: z.boolean().optional().default(true),
});

const router = Router();
router.use(authenticate);

router.get('/', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const filter = req.user.role?.dataScope === 'all' ? {} : { $or: [scope, { project: null }] };
  if (req.query.project) filter.project = req.query.project;
  if (req.query.status) filter.status = req.query.status;
  const rows = await Equipment.find(filter)
    .populate('project', 'code name')
    .populate('site', 'code name')
    .populate('vendorRef', 'code name')
    .sort({ code: 1 })
    .lean();
  sendSuccess(res, rows.map((e) => ({ id: String(e._id), ...e })));
});

router.post('/', can(CREATE), validate({ body: createEquipmentSchema }), async (req, res) => {
  if (req.body.project && !canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const code = await nextSequenceNumber('equipment', { prefixOverride: 'EQP', minPadding: 3 });
  const eq = await Equipment.create({
    ...req.body,
    code,
    status: req.body.project ? 'deployed' : 'available',
    nextServiceDueDate: req.body.nextServiceDueDate ? new Date(req.body.nextServiceDueDate) : undefined,
    createdBy: req.user._id,
  });
  await eq.populate('project site');
  sendSuccess(res, { id: String(eq._id), ...eq.toObject() }, { status: 201, message: `Equipment ${code} added` });
});

router.patch('/:id', can(UPDATE), validate({ params: z.object({ id: objectId }), body: updateEquipmentSchema }), async (req, res) => {
  const eq = await Equipment.findById(req.validated.params.id);
  if (!eq) throw ApiError.notFound('Equipment not found');
  if (eq.project && !canAccessProject(req.user, eq.project)) throw ApiError.notFound('Equipment not found');
  if (req.body.project && !canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  Object.assign(eq, req.body);
  if (req.body.nextServiceDueDate) eq.nextServiceDueDate = new Date(req.body.nextServiceDueDate);
  await eq.save();
  await eq.populate('project site');
  sendSuccess(res, { id: String(eq._id), ...eq.toObject() }, { message: 'Equipment updated' });
});

router.get('/logs', can(READ), async (req, res) => {
  const scope = buildProjectScope(req.user, { projectField: 'project' });
  const filter = { ...scope };
  if (req.query.project) filter.project = req.query.project;
  if (req.query.equipment) filter.equipment = req.query.equipment;
  const rows = await EquipmentLog.find(filter)
    .populate('equipment', 'code name category')
    .populate('project', 'code name')
    .populate('site', 'code name')
    .sort({ logDate: -1 })
    .limit(200)
    .lean();
  sendSuccess(res, rows.map((l) => ({ id: String(l._id), ...l })));
});

router.post('/logs', authorize(MODULES.EQUIPMENT, CREATE, UPDATE), validate({ body: createLogSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to project');
  const eq = await Equipment.findById(req.body.equipment);
  if (!eq) throw ApiError.notFound('Equipment not found');

  const log = await EquipmentLog.create({ ...req.body, recordedBy: req.user._id });
  if (req.body.logType === 'breakdown' && !req.body.resolved) {
    eq.status = 'maintenance';
    await eq.save();
  } else if (req.body.logType === 'maintenance' && req.body.resolved) {
    eq.lastServiceDate = new Date();
    eq.status = eq.project ? 'deployed' : 'available';
    await eq.save();
  }
  await log.populate('equipment project site');
  sendSuccess(res, { id: String(log._id), ...log.toObject() }, { status: 201, message: 'Equipment log recorded' });
});

export default router;
