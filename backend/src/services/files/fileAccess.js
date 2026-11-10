import mongoose from 'mongoose';
import { DATA_SCOPES, MODULES } from '../../config/rbac.js';
import { ApiError } from '../../utils/ApiError.js';
import { canAccessProject } from '../../utils/scope.js';
import { createFileAccessUrl } from '../storage/index.js';

/*
 * Record-level access rules for stored files. There is no Document model or download
 * route yet (Document Management is scheduled for Phase 4); module code that stores file
 * descriptors must authorise every read through assertFileAccess().
 *
 * Expected file record shape: { _id, project?, uploadedBy, owner?: { contractor?, customer? }, storage }.
 *
 * Tenancy: the ERP is single-company. "Company" isolation is therefore the project scope
 * (role.dataScope + user.assignedProjects); there is no company id to compare.
 */

const notFound = () => ApiError.notFound('File not found');
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** Strict 24-hex ObjectId check; anything else is reported as not found. */
export function parseFileId(value) {
  const id = String(value ?? '');
  if (!/^[a-f0-9]{24}$/i.test(id) || !mongoose.isValidObjectId(id)) throw notFound();
  return id;
}

function isPortalOwner(user, file) {
  if (sameId(file.uploadedBy, user._id)) return true;
  return sameId(file.owner?.contractor, user.contractor) || sameId(file.owner?.customer, user.customer);
}

const canUser = (user, module, action) =>
  typeof user?.can === 'function' ? user.can(module, action) : Boolean(user?.role?.can?.(module, action));

/**
 * Throws unless `user` may perform `action` on `file` in `module`.
 * Out-of-scope records are reported as 404 so identifiers cannot be probed (IDOR/BOLA).
 */
export function assertFileAccess(user, file, { module = MODULES.DOCUMENTS, action = 'read' } = {}) {
  if (!user?.role) throw ApiError.unauthorized();
  if (!canUser(user, module, action)) throw ApiError.forbidden(`Your role cannot ${action} in ${module}`);
  if (!file) throw notFound();

  const scope = user.role.dataScope;
  if (!Object.values(DATA_SCOPES).includes(scope)) throw notFound();
  if (file.project) {
    if (!canAccessProject(user, file.project)) throw notFound();
  } else if (scope !== DATA_SCOPES.ALL && !sameId(file.uploadedBy, user._id)) {
    // Files outside any project are private to their uploader unless the role sees everything.
    throw notFound();
  }
  if (scope === DATA_SCOPES.OWN && !isPortalOwner(user, file)) throw notFound();
}

/** Upload target check: the user must be able to create in `module` within `projectId`. */
export function assertProjectWriteAccess(user, projectId, { module = MODULES.DOCUMENTS } = {}) {
  if (!user?.role) throw ApiError.unauthorized();
  if (!canUser(user, module, 'create')) throw ApiError.forbidden(`Your role cannot create in ${module}`);
  if (projectId == null) return;
  if (!mongoose.isValidObjectId(projectId) || !canAccessProject(user, projectId)) {
    throw ApiError.notFound('Project not found');
  }
}

/**
 * Download handler factory for a future documents router. Mount behind authenticate:
 *
 *   router.get('/:id/download', authenticate, authorize('documents', 'read'),
 *     createFileDownloadHandler({ findFile: (id) => Document.findById(id).lean() }));
 *
 * Responds with a short-lived signed URL; the storage key and provider are not returned.
 */
export function createFileDownloadHandler({ findFile, module = MODULES.DOCUMENTS, createUrl = createFileAccessUrl }) {
  return async function downloadFile(req, res) {
    const id = parseFileId(req.params.id);
    const file = await findFile(id);
    assertFileAccess(req.user, file, { module, action: 'read' });
    const { url, expiresAt } = createUrl(file.storage);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { url, expiresAt, name: file.storage?.originalName ?? 'file' } });
  };
}
