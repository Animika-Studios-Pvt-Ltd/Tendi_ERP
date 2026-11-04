import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';
import { getUploadContext, uploadAbortedError } from '../upload/uploadContext.js';
import { cloudinaryProvider } from './cloudinary.provider.js';

/**
 * Storage provider contract:
 *   upload(file: { buffer, storedName, ext, mimeType, size, originalName, resourceType }, { folder }) =>
 *     Promise<{ provider, key, resourceType, deliveryType, format, mimeType, size, originalName }>
 *   remove(key, { resourceType }) => Promise<void>
 *   getSignedUrl(key, { resourceType, format, expiresInSeconds }) => { url, expiresAt }
 *   isConfigured() => boolean
 *
 * Stored files are private. Callers persist the returned descriptor (never a URL) and
 * issue a short-lived signed URL only after authorising the requesting user.
 *
 * Add an S3 provider implementing the same contract and register it below.
 */
const providers = {
  cloudinary: cloudinaryProvider,
};

const FOLDER_PATTERN = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

export function getStorage() {
  const provider = providers[env.STORAGE_PROVIDER];
  if (!provider) throw ApiError.unavailable(`Storage provider "${env.STORAGE_PROVIDER}" is not implemented yet`);
  if (!provider.isConfigured()) throw ApiError.unavailable('File storage is not configured');
  return provider;
}

export function getStorageStatus() {
  const provider = providers[env.STORAGE_PROVIDER];
  return { provider: env.STORAGE_PROVIDER, configured: Boolean(provider?.isConfigured()) };
}

/** 128-bit random id; the only name a stored object ever gets. */
export function generateStoredName() {
  return crypto.randomBytes(16).toString('hex');
}

/** Folder is chosen by server code (e.g. "documents/<projectId>"), never by the client. */
export function resolveFolder(folder) {
  if (!FOLDER_PATTERN.test(folder ?? '')) throw new TypeError('Invalid storage folder');
  return `${env.CLOUDINARY_FOLDER}/${folder}`;
}

async function rollbackStored(storage, stored) {
  const results = await Promise.allSettled(stored.map((item) => storage.remove(item.key, { resourceType: item.resourceType })));
  // Stored keys are random ids, safe to log so orphans can be removed manually.
  const orphaned = stored.filter((_item, index) => results[index].status === 'rejected').map((item) => item.key);
  if (orphaned.length) logger.error('upload.rollback_failed', JSON.stringify({ provider: storage.name, orphaned }));
}

async function storeBatch(items, { target, ctx }) {
  if (ctx?.aborted) throw uploadAbortedError();
  const storage = getStorage();
  const stored = [];
  try {
    for (const { buffer, meta } of items) {
      // Never start another upload for a request that is already gone.
      if (ctx?.aborted) throw uploadAbortedError();
      const { ext, mimeType, size, originalName, resourceType } = meta;
      stored.push(
        await storage.upload(
          { buffer, storedName: generateStoredName(), ext, mimeType, size, originalName, resourceType },
          { folder: target },
        ),
      );
    }
    // A client that left before the response cannot learn the result; keep nothing.
    if (ctx?.aborted) throw uploadAbortedError();
    return stored.map((item) => ({ ...item, scanStatus: 'not_scanned' }));
  } catch (error) {
    const aborted = error?.code === 'UPLOAD_ABORTED';
    // Provider responses can contain account details; log the class of failure only.
    logger.error(
      aborted ? 'upload.aborted' : 'upload.storage_failed',
      JSON.stringify({ provider: storage.name, stored: stored.length, error: aborted ? 'UPLOAD_ABORTED' : error?.name }),
    );
    await rollbackStored(storage, stored);
    if (aborted) throw error;
    throw new ApiError(502, 'The file could not be stored. Try again.', { code: 'UPLOAD_FAILED' });
  }
}

/**
 * Stores files that passed createUpload() validation, sequentially (bounded provider
 * concurrency). The batch is all-or-nothing: on any failure, or if the request is
 * aborted, files already stored are removed and a client-safe error is thrown.
 *
 * Buffers are captured up front, and the batch is registered with the request's upload
 * context synchronously, so the concurrency slot and buffers stay reserved until storage
 * and any rollback have settled, even if the client disconnects.
 */
export function storeValidatedFiles(files, { folder }) {
  let target;
  let items;
  try {
    target = resolveFolder(folder);
    items = files.map((file) => {
      const meta = file?.validated;
      if (!meta || !Buffer.isBuffer(file.buffer) || file.buffer.length !== meta.size) {
        throw new TypeError('storeValidatedFiles() requires files validated by createUpload()');
      }
      return { buffer: file.buffer, meta };
    });
  } catch (error) {
    return Promise.reject(error);
  }

  const ctx = getUploadContext(files);
  if (ctx?.released) return Promise.reject(uploadAbortedError());
  const batch = storeBatch(items, { target, ctx });
  return ctx ? ctx.track(batch) : batch;
}

/** Short-lived signed URL for a stored descriptor. Authorise the user before calling. */
export function createFileAccessUrl(descriptor) {
  return getStorage().getSignedUrl(descriptor.key, {
    resourceType: descriptor.resourceType,
    format: descriptor.format,
    expiresInSeconds: env.FILE_URL_TTL_SECONDS,
  });
}
