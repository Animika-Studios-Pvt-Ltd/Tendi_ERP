import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { ACTIONS, DATA_SCOPES, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { createUpload, FILE_TYPES } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import { Document, DOCUMENT_CATEGORIES, DOCUMENT_VISIBILITY } from '../../models/Document.js';
import { Drawing, DRAWING_DISCIPLINE, REVISION_STATUS } from '../../models/Drawing.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { Rfi, Submittal, Transmittal } from '../../models/Rfi.js';
import { executeApprovalTransition } from '../../services/approval.service.js';
import { recordAudit } from '../../services/audit.service.js';
import { assertFileAccess, assertProjectWriteAccess, createFileDownloadHandler } from '../../services/files/fileAccess.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { storeValidatedFiles } from '../../services/storage/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { paginate, parsePagination } from '../../utils/pagination.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';

const { CREATE, READ, UPDATE, DELETE, APPROVE, REJECT } = ACTIONS;
const can = (action) => authorize(MODULES.DOCUMENTS, action);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');
const nullableId = z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null);
const text = (max) => z.string().trim().max(max);
const dateField = z
  .union([z.string().trim().min(1), z.literal(''), z.null()])
  .transform((v) => (v ? new Date(v) : null));
const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fullName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ');
const toPerson = (p) => (p?._id ? { id: String(p._id), fullName: fullName(p), email: p.email } : null);

function docScope(user) {
  if (!user?.role) return { _id: null };
  if (user.role.dataScope === DATA_SCOPES.ALL) return {};
  const projectScope = buildProjectScope(user, { projectField: 'project' });
  if (user.role.key === 'customer') {
    return { $and: [projectScope, { visibility: { $in: [DOCUMENT_VISIBILITY.CLIENT, DOCUMENT_VISIBILITY.ALL] } }] };
  }
  if (user.role.key === 'contractor') {
    return { $and: [projectScope, { visibility: { $in: [DOCUMENT_VISIBILITY.CONTRACTOR, DOCUMENT_VISIBILITY.ALL] } }] };
  }
  return projectScope;
}

const createDocumentSchema = z.object({
  title: z.string().trim().min(2).max(180),
  project: nullableId.optional(),
  site: nullableId.optional(),
  folder: text(100).optional().default('General'),
  category: z.enum(Object.values(DOCUMENT_CATEGORIES)).optional().default(DOCUMENT_CATEGORIES.OTHER),
  tags: z.array(z.string().trim().max(40)).optional().default([]),
  externalUrl: text(500).optional().default(''),
  expiryDate: dateField.optional(),
  visibility: z.enum(Object.values(DOCUMENT_VISIBILITY)).optional().default(DOCUMENT_VISIBILITY.INTERNAL),
  notes: text(500).optional().default(''),
});

const createDrawingSchema = z.object({
  title: z.string().trim().min(2).max(180),
  project: objectId,
  site: nullableId.optional(),
  discipline: z.enum(Object.values(DRAWING_DISCIPLINE)).optional().default(DRAWING_DISCIPLINE.STRUCTURAL),
  scale: text(30).optional().default('1:100'),
  revCode: text(20).optional().default('R0'),
  notes: text(500).optional().default(''),
  externalUrl: text(500).optional().default(''),
});

const addDrawingRevSchema = z.object({
  revCode: z.string().trim().min(1).max(20),
  notes: text(500).optional().default(''),
  externalUrl: text(500).optional().default(''),
  documentRef: nullableId.optional(),
});

const reviewDrawingRevSchema = z.object({
  status: z.enum([REVISION_STATUS.SUBMITTED, REVISION_STATUS.APPROVED, REVISION_STATUS.REJECTED]),
  notes: text(500).optional(),
});

const createRfiSchema = z.object({
  project: objectId,
  site: nullableId.optional(),
  drawingRef: nullableId.optional(),
  subject: z.string().trim().min(2).max(180),
  question: z.string().trim().min(2).max(2000),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  assignedTo: nullableId.optional(),
  dueDate: dateField.optional(),
});

const updateRfiSchema = z.object({
  response: text(2000).optional(),
  status: z.enum(['open', 'answered', 'closed']).optional(),
});

const createSubmittalSchema = z.object({
  project: objectId,
  type: z.enum(['material', 'technical', 'shop_drawing', 'sample']).optional().default('material'),
  title: z.string().trim().min(2).max(180),
  specificationRef: text(120).optional().default(''),
  documentRef: nullableId.optional(),
  remarks: text(1000).optional().default(''),
});

const transitionSchema = z.object({
  status: z.enum(Object.values(APPROVAL_STATUS)),
  comment: text(500).optional().default(''),
});

const createTransmittalSchema = z.object({
  project: objectId,
  recipientType: z.enum(['client', 'consultant', 'contractor', 'authority']).optional().default('client'),
  recipientName: z.string().trim().min(1).max(150),
  subject: z.string().trim().min(2).max(180),
  documentIds: z.array(objectId).optional().default([]),
  drawingIds: z.array(objectId).optional().default([]),
  remarks: text(1000).optional().default(''),
});

function toDocumentDto(doc) {
  const d = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(d._id),
    documentNumber: d.documentNumber,
    title: d.title,
    project: d.project?._id ? { id: String(d.project._id), code: d.project.code, name: d.project.name } : null,
    folder: d.folder,
    category: d.category,
    tags: d.tags ?? [],
    currentVersion: d.currentVersion ?? 1,
    versions: d.versions ?? [],
    hasStoredFile: Boolean(d.storage?.key),
    originalName: d.storage?.originalName || '',
    externalUrl: d.externalUrl ?? '',
    expiryDate: d.expiryDate ?? null,
    isObsolete: Boolean(d.isObsolete),
    visibility: d.visibility,
    status: d.status,
    uploadedBy: toPerson(d.uploadedBy),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

const router = Router();
router.use(authenticate);

/* =========================================================================
 * DRAWINGS & REVISIONS
 * ========================================================================= */
router.get('/drawings', can(READ), async (req, res) => {
  const filter = { ...buildProjectScope(req.user, { projectField: 'project' }) };
  if (req.query.project) filter.project = req.query.project;
  if (req.query.discipline) filter.discipline = req.query.discipline;
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ drawingNumber: rx }, { title: rx }];
  }
  const pagination = parsePagination(req.query, { allowedSortFields: ['createdAt', 'drawingNumber'], defaultSort: '-createdAt' });
  const { items, meta } = await paginate(Drawing, filter, pagination, {
    populate: [{ path: 'project', select: 'code name' }],
  });
  sendSuccess(
    res,
    items.map((d) => ({
      id: String(d._id),
      drawingNumber: d.drawingNumber,
      title: d.title,
      project: d.project?._id ? { id: String(d.project._id), code: d.project.code, name: d.project.name } : null,
      discipline: d.discipline,
      scale: d.scale,
      currentRevisionCode: d.currentRevisionCode,
      revisions: d.revisions ?? [],
      createdAt: d.createdAt,
    })),
    { meta },
  );
});

router.post('/drawings', can(CREATE), validate({ body: createDrawingSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('You do not have access to this project');
  const drawingNumber = await nextSequenceNumber('drawing', { prefixOverride: 'DRW', minPadding: 3 });
  const revCode = req.body.revCode.toUpperCase();
  const drawing = await Drawing.create({
    drawingNumber,
    title: req.body.title,
    project: req.body.project,
    site: req.body.site || null,
    discipline: req.body.discipline,
    scale: req.body.scale,
    currentRevisionCode: revCode,
    revisions: [
      {
        revCode,
        notes: req.body.notes || '',
        externalUrl: req.body.externalUrl || '',
        status: REVISION_STATUS.DRAFT,
        uploadedBy: req.user._id,
      },
    ],
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  recordAudit(req, { action: 'drawing.create', module: MODULES.DOCUMENTS, entityType: 'Drawing', entityId: drawing._id, project: drawing.project, summary: `Registered drawing ${drawingNumber}` });
  await drawing.populate('project', 'code name');
  sendSuccess(res, { id: String(drawing._id), ...drawing.toObject() }, { status: 201, message: 'Drawing registered' });
});

router.post('/drawings/:id/revisions', can(UPDATE), validate({ params: z.object({ id: objectId }), body: addDrawingRevSchema }), async (req, res) => {
  const drawing = await Drawing.findById(req.validated.params.id);
  if (!drawing || !canAccessProject(req.user, drawing.project)) throw ApiError.notFound('Drawing not found');
  const revCode = req.body.revCode.toUpperCase();
  if (drawing.revisions.some((r) => r.revCode === revCode)) {
    throw ApiError.badRequest(`Revision ${revCode} already exists on this drawing`);
  }
  drawing.revisions.push({
    revCode,
    notes: req.body.notes,
    externalUrl: req.body.externalUrl,
    documentRef: req.body.documentRef || null,
    status: REVISION_STATUS.SUBMITTED,
    uploadedBy: req.user._id,
  });
  drawing.updatedBy = req.user._id;
  await drawing.save();
  sendSuccess(res, { id: String(drawing._id), currentRevisionCode: drawing.currentRevisionCode, revisions: drawing.revisions }, { status: 201, message: `Added revision ${revCode}` });
});

router.post(
  '/drawings/:id/revisions/:revId/review',
  authorize(MODULES.DOCUMENTS, UPDATE, APPROVE, REJECT),
  validate({ params: z.object({ id: objectId, revId: objectId }), body: reviewDrawingRevSchema }),
  async (req, res) => {
    const drawing = await Drawing.findById(req.validated.params.id);
    if (!drawing || !canAccessProject(req.user, drawing.project)) throw ApiError.notFound('Drawing not found');
    const rev = drawing.revisions.id(req.validated.params.revId);
    if (!rev) throw ApiError.notFound('Revision not found');

    if (req.body.status === REVISION_STATUS.APPROVED) {
      if (!req.user.can(MODULES.DOCUMENTS, APPROVE)) throw ApiError.forbidden('Your role cannot approve drawing revisions');
      // Supersede prior approved revisions cleanly
      for (const existing of drawing.revisions) {
        if (String(existing._id) !== String(rev._id) && existing.status === REVISION_STATUS.APPROVED) {
          existing.status = REVISION_STATUS.OBSOLETE;
          existing.supersededAt = new Date();
        }
      }
      rev.status = REVISION_STATUS.APPROVED;
      rev.approvedBy = req.user._id;
      rev.approvedAt = new Date();
      drawing.currentRevisionCode = rev.revCode;
    } else if (req.body.status === REVISION_STATUS.REJECTED) {
      if (!req.user.can(MODULES.DOCUMENTS, REJECT)) throw ApiError.forbidden('Your role cannot reject drawing revisions');
      rev.status = REVISION_STATUS.REJECTED;
    } else {
      rev.status = req.body.status;
    }
    if (req.body.notes) rev.notes = req.body.notes;
    drawing.updatedBy = req.user._id;
    await drawing.save();
    sendSuccess(res, { id: String(drawing._id), currentRevisionCode: drawing.currentRevisionCode, revisions: drawing.revisions }, { message: `Revision ${rev.revCode} marked ${rev.status}` });
  },
);

/* =========================================================================
 * RFIs, SUBMITTALS & TRANSMITTALS
 * ========================================================================= */
router.get('/rfis', can(READ), async (req, res) => {
  const filter = { ...buildProjectScope(req.user, { projectField: 'project' }) };
  if (req.query.project) filter.project = req.query.project;
  if (req.query.status) filter.status = req.query.status;
  const rows = await Rfi.find(filter).populate('project', 'code name').populate('assignedTo', 'firstName lastName').sort({ createdAt: -1 }).lean();
  sendSuccess(res, rows.map((r) => ({ ...r, id: String(r._id) })));
});

router.post('/rfis', can(CREATE), validate({ body: createRfiSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to selected project');
  const rfiNumber = await nextSequenceNumber('rfi', { prefixOverride: 'RFI', minPadding: 3 });
  const rfi = await Rfi.create({ ...req.body, rfiNumber, createdBy: req.user._id, updatedBy: req.user._id });
  sendSuccess(res, { id: String(rfi._id), ...rfi.toObject() }, { status: 201, message: 'RFI raised' });
});

router.patch('/rfis/:id', can(UPDATE), validate({ params: z.object({ id: objectId }), body: updateRfiSchema }), async (req, res) => {
  const rfi = await Rfi.findById(req.validated.params.id);
  if (!rfi || !canAccessProject(req.user, rfi.project)) throw ApiError.notFound('RFI not found');
  if (req.body.response !== undefined) {
    rfi.response = req.body.response;
    rfi.respondedBy = req.user._id;
    rfi.respondedAt = new Date();
    if (!req.body.status && rfi.status === 'open') rfi.status = 'answered';
  }
  if (req.body.status) rfi.status = req.body.status;
  rfi.updatedBy = req.user._id;
  await rfi.save();
  sendSuccess(res, { id: String(rfi._id), ...rfi.toObject() }, { message: 'RFI updated' });
});

router.get('/submittals', can(READ), async (req, res) => {
  const filter = { ...buildProjectScope(req.user, { projectField: 'project' }) };
  if (req.query.project) filter.project = req.query.project;
  const rows = await Submittal.find(filter).populate('project', 'code name').sort({ createdAt: -1 }).lean();
  sendSuccess(res, rows.map((s) => ({ ...s, id: String(s._id) })));
});

router.post('/submittals', can(CREATE), validate({ body: createSubmittalSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to selected project');
  const submittalNumber = await nextSequenceNumber('submittal', { prefixOverride: 'SUB', minPadding: 3 });
  const sub = await Submittal.create({ ...req.body, submittalNumber, createdBy: req.user._id, updatedBy: req.user._id });
  sendSuccess(res, { id: String(sub._id), ...sub.toObject() }, { status: 201, message: 'Submittal created' });
});

router.post(
  '/submittals/:id/transition',
  authorize(MODULES.DOCUMENTS, CREATE, UPDATE, APPROVE, REJECT),
  validate({ params: z.object({ id: objectId }), body: transitionSchema }),
  async (req, res) => {
    const sub = await Submittal.findById(req.validated.params.id);
    if (!sub || !canAccessProject(req.user, sub.project)) throw ApiError.notFound('Submittal not found');
    await executeApprovalTransition(req.user, sub, { module: MODULES.DOCUMENTS, targetStatus: req.body.status, comment: req.body.comment });
    await sub.save();
    sendSuccess(res, { id: String(sub._id), ...sub.toObject() }, { message: `Submittal ${sub.status}` });
  },
);

router.get('/transmittals', can(READ), async (req, res) => {
  const filter = { ...buildProjectScope(req.user, { projectField: 'project' }) };
  if (req.query.project) filter.project = req.query.project;
  const rows = await Transmittal.find(filter).populate('project', 'code name').sort({ createdAt: -1 }).lean();
  sendSuccess(res, rows.map((t) => ({ ...t, id: String(t._id) })));
});

router.post('/transmittals', can(CREATE), validate({ body: createTransmittalSchema }), async (req, res) => {
  if (!canAccessProject(req.user, req.body.project)) throw ApiError.forbidden('No access to selected project');
  const transmittalNumber = await nextSequenceNumber('transmittal', { prefixOverride: 'TRN', minPadding: 3 });
  const trn = await Transmittal.create({ ...req.body, transmittalNumber, createdBy: req.user._id });
  sendSuccess(res, { id: String(trn._id), ...trn.toObject() }, { status: 201, message: 'Transmittal logged' });
});

/* =========================================================================
 * CENTRAL DOCUMENT REPOSITORY (WITH UPLOAD & SIGNED DOWNLOAD)
 * ========================================================================= */
router.get('/', can(READ), async (req, res) => {
  const filter = { ...docScope(req.user) };
  if (req.query.project) filter.project = req.query.project;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.folder) filter.folder = req.query.folder;
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ documentNumber: rx }, { title: rx }, { folder: rx }];
  }
  const pagination = parsePagination(req.query, { allowedSortFields: ['createdAt', 'title', 'expiryDate'], defaultSort: '-createdAt' });
  const { items, meta } = await paginate(Document, filter, pagination, {
    populate: [
      { path: 'project', select: 'code name' },
      { path: 'uploadedBy', select: 'firstName lastName email' },
    ],
  });
  sendSuccess(res, items.map(toDocumentDto), { meta });
});

router.post('/', can(CREATE), validate({ body: createDocumentSchema }), async (req, res) => {
  if (req.body.project && !canAccessProject(req.user, req.body.project)) {
    throw ApiError.forbidden('No access to selected project');
  }
  const documentNumber = await nextSequenceNumber('document', { prefixOverride: 'DOC', minPadding: 4 });
  const doc = await Document.create({
    ...req.body,
    documentNumber,
    currentVersion: 1,
    versions: [{ versionNo: 1, notes: req.body.notes || 'Initial issue', externalUrl: req.body.externalUrl || '', uploadedBy: req.user._id }],
    uploadedBy: req.user._id,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  recordAudit(req, { action: 'document.create', module: MODULES.DOCUMENTS, entityType: 'Document', entityId: doc._id, project: doc.project, summary: `Registered document ${documentNumber}` });
  await doc.populate('project', 'code name');
  await doc.populate('uploadedBy', 'firstName lastName email');
  sendSuccess(res, toDocumentDto(doc), { status: 201, message: 'Document created' });
});

router.post(
  '/upload',
  can(CREATE),
  createUpload({ allowedTypes: FILE_TYPES.documents, maxFiles: 1, required: true }).single('file'),
  async (req, res) => {
    const projectId = req.body.project || null;
    assertProjectWriteAccess(req.user, projectId, { module: MODULES.DOCUMENTS });
    const folder = projectId ? `documents/${projectId}` : 'documents/general';
    const [stored] = await storeValidatedFiles([req.file], { folder });

    const documentNumber = await nextSequenceNumber('document', { prefixOverride: 'DOC', minPadding: 4 });
    const doc = await Document.create({
      documentNumber,
      title: String(req.body.title || stored.originalName || documentNumber).slice(0, 180),
      project: projectId,
      folder: String(req.body.folder || 'General').slice(0, 100),
      category: Object.values(DOCUMENT_CATEGORIES).includes(req.body.category) ? req.body.category : DOCUMENT_CATEGORIES.OTHER,
      visibility: Object.values(DOCUMENT_VISIBILITY).includes(req.body.visibility) ? req.body.visibility : DOCUMENT_VISIBILITY.INTERNAL,
      currentVersion: 1,
      storage: stored,
      versions: [{ versionNo: 1, storage: stored, uploadedBy: req.user._id }],
      uploadedBy: req.user._id,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    await doc.populate('project', 'code name');
    await doc.populate('uploadedBy', 'firstName lastName email');
    sendSuccess(res, toDocumentDto(doc), { status: 201, message: 'Document uploaded securely' });
  },
);

const uploadVersionChain = createUpload({ allowedTypes: FILE_TYPES.documents, maxFiles: 1, required: false }).single('file');
const maybeUploadVersion = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  let idx = 0;
  const run = (err) => {
    if (err || idx >= uploadVersionChain.length) return next(err);
    const mw = uploadVersionChain[idx++];
    return mw(req, res, run);
  };
  return run();
};

router.post(
  '/:id/versions',
  can(UPDATE),
  maybeUploadVersion,
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.notFound('Document not found');
    const doc = await Document.findById(req.params.id);
    assertFileAccess(req.user, doc, { module: MODULES.DOCUMENTS, action: 'read' });

    const nextVer = (doc.currentVersion || 1) + 1;
    let stored = null;
    if (req.file) {
      const folder = doc.project ? `documents/${doc.project}` : 'documents/general';
      [stored] = await storeValidatedFiles([req.file], { folder });
      doc.storage = stored;
    }
    doc.currentVersion = nextVer;
    doc.versions.push({
      versionNo: nextVer,
      notes: String(req.body.notes || `Version v${nextVer}`).slice(0, 500),
      storage: stored || undefined,
      externalUrl: String(req.body.externalUrl || '').slice(0, 500),
      uploadedBy: req.user._id,
    });
    doc.updatedBy = req.user._id;
    await doc.save();
    await doc.populate('project', 'code name');
    await doc.populate('uploadedBy', 'firstName lastName email');
    sendSuccess(res, toDocumentDto(doc), { status: 201, message: `Uploaded version v${nextVer}` });
  },
);

router.get(
  '/:id/download',
  can(READ),
  createFileDownloadHandler({
    module: MODULES.DOCUMENTS,
    findFile: (id) => Document.findById(id).lean(),
  }),
);

router.post(
  '/:id/transition',
  authorize(MODULES.DOCUMENTS, CREATE, UPDATE, APPROVE, REJECT),
  validate({ params: z.object({ id: objectId }), body: transitionSchema }),
  async (req, res) => {
    const doc = await Document.findById(req.validated.params.id);
    assertFileAccess(req.user, doc, { module: MODULES.DOCUMENTS, action: 'read' });
    await executeApprovalTransition(req.user, doc, { module: MODULES.DOCUMENTS, targetStatus: req.body.status, comment: req.body.comment });
    await doc.save();
    await doc.populate('project', 'code name');
    await doc.populate('uploadedBy', 'firstName lastName email');
    sendSuccess(res, toDocumentDto(doc), { message: `Document transitioned to ${doc.status}` });
  },
);

export default router;
