import { PassThrough } from 'node:stream';
import { mock } from 'node:test';
import { v2 as cloudinary } from 'cloudinary';
import express from 'express';
import mongoose from 'mongoose';
import { DEFAULT_ROLES, ROLES, toPermissionEntries } from '../../src/config/rbac.js';
import { authenticate, authorize } from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { createUpload, getActiveUploadCount } from '../../src/middleware/upload.js';
import { Role } from '../../src/models/Role.js';
import { User } from '../../src/models/User.js';
import { assertProjectWriteAccess, createFileDownloadHandler } from '../../src/services/files/fileAccess.js';
import { storeValidatedFiles } from '../../src/services/storage/index.js';
import { signAccessToken } from '../../src/utils/token.js';

const oid = () => new mongoose.Types.ObjectId();

function roleFor(key, overrides = {}) {
  const base = DEFAULT_ROLES.find((role) => role.key === key);
  return new Role({
    key,
    name: base?.name ?? key,
    dataScope: base?.dataScope ?? 'assigned',
    permissions: toPermissionEntries(base?.permissions ?? {}),
    isActive: true,
    ...overrides,
  });
}

export const projectA = oid();
export const projectB = oid();
const customerA = oid();
const customerB = oid();

function makeUser(name, role, extra = {}) {
  const user = new User({ firstName: name, email: `${name}@example.test`, password: 'x'.repeat(12), role: role._id, ...extra });
  user.role = role;
  return user;
}

export const users = {
  admin: makeUser('admin', roleFor(ROLES.COMPANY_ADMIN)),
  pmA: makeUser('pma', roleFor(ROLES.PROJECT_MANAGER), { assignedProjects: [projectA] }),
  pmB: makeUser('pmb', roleFor(ROLES.PROJECT_MANAGER), { assignedProjects: [projectB] }),
  customerA: makeUser('custa', roleFor(ROLES.CUSTOMER), { assignedProjects: [projectA], customer: customerA }),
  customerB: makeUser('custb', roleFor(ROLES.CUSTOMER), { assignedProjects: [projectA], customer: customerB }),
  noDocuments: makeUser('nodocs', roleFor('dashboard_only', { permissions: toPermissionEntries({ dashboard: ['read'] }) })),
};

export const tokenFor = (user) => signAccessToken(user);

/** In-memory "file records" standing in for a future Document model. */
export const fileRecords = new Map();
export function addFileRecord({ project, uploadedBy, owner }) {
  const id = String(oid());
  fileRecords.set(id, {
    _id: id,
    project,
    uploadedBy: uploadedBy._id,
    owner,
    storage: { provider: 'cloudinary', key: `tendi-test/documents/${'a'.repeat(32)}.pdf`, resourceType: 'raw', format: 'pdf', originalName: 'report.pdf' },
  });
  return id;
}

/** Cloudinary network calls are replaced; options passed to the SDK are recorded. */
export const cloudinaryCalls = { uploads: [], destroys: [] };
export const cloudinaryBehaviour = { failOnUploadNumber: null, delayMs: 0 };

export function installMocks() {
  mock.method(User, 'findById', (id) => ({
    populate: async () => Object.values(users).find((user) => String(user._id) === String(id)) ?? null,
  }));

  mock.method(cloudinary.uploader, 'upload_stream', (options, callback) => {
    const sink = new PassThrough();
    const chunks = [];
    sink.on('data', (chunk) => chunks.push(chunk));
    sink.on('end', () => {
      const call = { options, bytes: Buffer.concat(chunks).length, activeUploadsDuring: getActiveUploadCount() };
      cloudinaryCalls.uploads.push(call);
      const number = cloudinaryCalls.uploads.length;
      setTimeout(() => {
        call.activeUploadsAtCompletion = getActiveUploadCount();
        if (cloudinaryBehaviour.failOnUploadNumber === number) {
          callback({ message: 'Invalid Signature 7f3a... for api_key 000000000000000', http_code: 401 });
          return;
        }
        callback(null, { public_id: `${options.folder}/${options.public_id}`, secure_url: 'https://res.cloudinary.com/should-not-leak' });
      }, cloudinaryBehaviour.delayMs);
    });
    return sink;
  });

  mock.method(cloudinary.uploader, 'destroy', async (key, options) => {
    cloudinaryCalls.destroys.push({ key, options });
    return { result: 'ok' };
  });
}

export function resetCalls() {
  cloudinaryCalls.uploads.length = 0;
  cloudinaryCalls.destroys.length = 0;
  cloudinaryBehaviour.failOnUploadNumber = null;
  cloudinaryBehaviour.delayMs = 0;
}

/** Captures the request object so tests can inspect cleanup after the response. */
export const seenRequests = [];

export function buildUploadApp() {
  const app = express();
  const upload = createUpload();

  app.post(
    '/documents',
    (req, _res, next) => {
      seenRequests.push(req);
      next();
    },
    authenticate,
    authorize('documents', 'create'),
    ...upload.array('files'),
    async (req, res) => {
      const project = req.body.project || null;
      assertProjectWriteAccess(req.user, project);
      const stored = await storeValidatedFiles(req.files, { folder: `documents/${project ?? 'general'}` });
      res.status(201).json({
        success: true,
        data: { files: stored.map(({ key, ...rest }) => ({ ...rest, id: key.split('/').pop() })) },
      });
    },
  );

  app.get(
    '/documents/:id/download',
    authenticate,
    authorize('documents', 'read'),
    createFileDownloadHandler({ findFile: async (id) => fileRecords.get(id) ?? null }),
  );

  app.use(errorHandler);
  return app;
}
