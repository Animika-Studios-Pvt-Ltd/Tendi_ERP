import multer from 'multer';
import { env } from '../config/env.js';
import {
  checkDeclaredType,
  FILE_TYPE_SPECS,
  UPLOAD_ERROR_CODES as C,
  uploadError,
  validateUploadedFile,
} from '../services/upload/fileValidation.js';
import { bindFilesToContext, createUploadContext } from '../services/upload/uploadContext.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

const S = FILE_TYPE_SPECS;

export const FILE_TYPES = Object.freeze({
  images: [S.jpeg.mime, S.png.mime, S.webp.mime],
  documents: [S.pdf.mime, S.doc.mime, S.docx.mime, S.xls.mime, S.xlsx.mime, S.jpeg.mime, S.png.mime, S.webp.mime],
});

const MB = 1024 * 1024;
// Room for multipart boundaries, part headers and small text fields on top of file bytes.
const MULTIPART_OVERHEAD_BYTES = 256 * 1024;
const MAX_TEXT_FIELDS = 20;
const MAX_TEXT_FIELD_BYTES = 64 * 1024;

let activeUploads = 0;
const activeUploadsByUser = new Map();

export function getActiveUploadCount() {
  return activeUploads;
}

export function getActiveUploadCountForUser(userId) {
  return activeUploadsByUser.get(`user:${userId}`) ?? 0;
}

function limitsFromEnv() {
  return {
    maxFileBytes: Math.floor(env.MAX_UPLOAD_SIZE_MB * MB),
    maxTotalBytes: Math.floor(env.MAX_UPLOAD_TOTAL_MB * MB),
    maxFiles: env.MAX_UPLOAD_FILES,
    maxConcurrent: env.MAX_CONCURRENT_UPLOADS,
    maxPerUser: env.MAX_CONCURRENT_UPLOADS_PER_USER,
    bodyTimeoutMs: env.UPLOAD_BODY_TIMEOUT_SECONDS * 1000,
  };
}

// Slots are keyed by account, not connection, so reconnecting does not grant new ones.
const ownerKey = (req) => (req.user?._id ? `user:${req.user._id}` : `ip:${req.ip}`);

function securityEvent(req, event, details = {}) {
  // Never log file contents, original filenames or request bodies.
  logger.warn(`upload.${event}`, JSON.stringify({ user: req.user?._id ? String(req.user._id) : null, ip: req.ip, ...details }));
}

function uploadedFiles(req) {
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
  return req.file ? [req.file] : [];
}

/** Drops every buffered upload from the request so the memory can be reclaimed. */
export function releaseUploadBuffers(req) {
  for (const file of uploadedFiles(req)) file.buffer = null;
  delete req.file;
  delete req.files;
}

/**
 * Rejects before any body is read: non-multipart requests, chunked bodies without a
 * declared length, and declared lengths beyond the aggregate limit. Node's HTTP parser
 * never delivers more body bytes than Content-Length, so this bounds the whole request.
 */
function guardRequestSize(limits) {
  return function uploadRequestGuard(req, _res, next) {
    if (!req.is('multipart/form-data')) {
      throw uploadError(415, C.MALFORMED_UPLOAD, 'Send files as multipart/form-data');
    }
    const declared = Number(req.headers['content-length']);
    if (!req.headers['content-length'] || !Number.isFinite(declared)) {
      throw uploadError(411, C.LENGTH_REQUIRED, 'The upload must declare its size');
    }
    if (declared > limits.maxTotalBytes + MULTIPART_OVERHEAD_BYTES) {
      securityEvent(req, 'rejected', { code: C.UPLOAD_TOO_LARGE, declaredBytes: declared });
      throw uploadError(413, C.UPLOAD_TOO_LARGE, `The upload exceeds the ${env.MAX_UPLOAD_TOTAL_MB} MB total limit`);
    }
    next();
  };
}

function onBodyTimeout(req, res, ctx) {
  if (req.complete || ctx.released) return;
  ctx.markAborted();
  securityEvent(req, 'timeout', { code: C.UPLOAD_TIMEOUT });
  const destroyRequest = () => req.destroy();
  if (res.headersSent) return destroyRequest();
  res.set('Connection', 'close');
  res.once('finish', destroyRequest);
  return res.status(408).json({
    success: false,
    error: { code: C.UPLOAD_TIMEOUT, message: 'The upload took too long. Try again on a faster connection.' },
  });
}

/**
 * Reserves a global and a per-user slot for the whole upload lifecycle. Slots and buffers
 * are released by the upload context only after the response has closed AND tracked
 * validation/storage/rollback work has settled, so disconnecting cannot free a slot early.
 */
function uploadGate(limits) {
  return function uploadConcurrencyGate(req, res, next) {
    const key = ownerKey(req);
    if (activeUploads >= limits.maxConcurrent) {
      securityEvent(req, 'busy', { active: activeUploads });
      res.set('Retry-After', '5');
      throw uploadError(503, C.UPLOAD_BUSY, 'The server is busy processing uploads. Try again shortly.');
    }
    if ((activeUploadsByUser.get(key) ?? 0) >= limits.maxPerUser) {
      securityEvent(req, 'user_limit', { limit: limits.maxPerUser });
      res.set('Retry-After', '5');
      throw uploadError(429, C.UPLOAD_USER_LIMIT, 'You already have uploads in progress. Wait for them to finish.');
    }

    activeUploads += 1;
    activeUploadsByUser.set(key, (activeUploadsByUser.get(key) ?? 0) + 1);

    let timer;
    const ctx = createUploadContext({
      onRelease() {
        clearTimeout(timer);
        activeUploads -= 1;
        const remaining = (activeUploadsByUser.get(key) ?? 1) - 1;
        if (remaining > 0) activeUploadsByUser.set(key, remaining);
        else activeUploadsByUser.delete(key);
        releaseUploadBuffers(req);
      },
    });
    req.uploadContext = ctx;

    // "close" fires after a normal finish too; only a close before finish is an abort.
    res.once('close', () => {
      if (!res.writableFinished) ctx.markAborted();
      ctx.responseClosed();
    });

    timer = setTimeout(() => onBodyTimeout(req, res, ctx), limits.bodyTimeoutMs);
    timer.unref();
    req.once('end', () => clearTimeout(timer));
    next();
  };
}

const MULTER_ERRORS = {
  LIMIT_FILE_SIZE: () => uploadError(413, C.FILE_TOO_LARGE, `Each file must be ${env.MAX_UPLOAD_SIZE_MB} MB or smaller`),
  LIMIT_FILE_COUNT: () => uploadError(400, C.TOO_MANY_FILES, `Upload at most ${env.MAX_UPLOAD_FILES} files at a time`),
  LIMIT_UNEXPECTED_FILE: () => uploadError(400, C.UNEXPECTED_FILE_FIELD, 'Files were sent in an unexpected field or exceed the allowed count'),
  LIMIT_PART_COUNT: () => uploadError(400, C.MALFORMED_UPLOAD, 'The upload has too many parts'),
  LIMIT_FIELD_KEY: () => uploadError(400, C.MALFORMED_UPLOAD, 'A form field name is too long'),
  LIMIT_FIELD_VALUE: () => uploadError(400, C.MALFORMED_UPLOAD, 'A form field value is too long'),
  LIMIT_FIELD_COUNT: () => uploadError(400, C.MALFORMED_UPLOAD, 'The upload has too many form fields'),
};

function toClientError(error) {
  if (error instanceof ApiError) return error;
  if (error instanceof multer.MulterError) return (MULTER_ERRORS[error.code] ?? MULTER_ERRORS.LIMIT_PART_COUNT)();
  // Busboy parse errors ("Unexpected end of form", bad headers, ...) are client errors.
  return uploadError(400, C.MALFORMED_UPLOAD, 'The upload could not be read');
}

function runMulter(handler) {
  return function parseMultipart(req, res, next) {
    handler(req, res, (error) => {
      // A body timeout already answered 408 and destroyed the request.
      if (res.headersSent) return undefined;
      if (!error) return next();
      releaseUploadBuffers(req);
      const clientError = toClientError(error);
      securityEvent(req, 'rejected', { code: clientError.code });
      return next(clientError);
    });
  };
}

async function validateAll(files, { allowedTypes, limits, required }) {
  if (files.length === 0) {
    if (!required) return;
    throw uploadError(400, C.NO_FILE, 'Attach a file to upload');
  }
  const total = files.reduce((sum, file) => sum + (file.buffer?.length ?? 0), 0);
  if (total > limits.maxTotalBytes) {
    throw uploadError(413, C.UPLOAD_TOO_LARGE, `The upload exceeds the ${env.MAX_UPLOAD_TOTAL_MB} MB total limit`);
  }
  for (const file of files) {
    file.validated = await validateUploadedFile(file, { allowedMimes: allowedTypes });
  }
}

function validateFiles(options) {
  return async function validateUploadedFiles(req, res, next) {
    const files = uploadedFiles(req);
    const ctx = req.uploadContext;
    if (ctx) bindFilesToContext(files, ctx);

    const validation = validateAll(files, options);
    // Buffers and the slot stay reserved while validation reads them.
    ctx?.track(validation);
    try {
      await validation;
    } catch (error) {
      const failing = files.find((file) => !file.validated);
      securityEvent(req, 'rejected', {
        code: error.code,
        declaredMime: failing?.mimetype?.slice(0, 100),
        size: failing?.size,
      });
      releaseUploadBuffers(req);
      if (res.headersSent) return undefined;
      return next(error instanceof ApiError ? error : uploadError(400, C.MALFORMED_UPLOAD, 'The upload could not be read'));
    }
    if (ctx?.aborted || res.headersSent) return undefined;
    return next();
  };
}

/**
 * Builds hardened upload middleware. Mount it after authenticate + authorize(...):
 *
 *   router.post('/', authenticate, authorize('documents', 'create'),
 *     createUpload().array('files'), controller.upload);
 *
 * .single()/.array()/.fields() return middleware chains. On success every file carries
 * `file.validated` ({ kind, ext, mimeType, resourceType, size, originalName }); only
 * those values may be trusted. Buffers are dropped automatically when the response ends.
 */
export function createUpload({ allowedTypes = FILE_TYPES.documents, maxFiles, required = true } = {}) {
  const limits = limitsFromEnv();
  const fileLimit = Math.min(maxFiles ?? limits.maxFiles, limits.maxFiles);

  const parser = multer({
    storage: multer.memoryStorage(),
    // Browsers send UTF-8 filenames; client paths are stripped to the basename.
    defParamCharset: 'utf8',
    preservePath: false,
    limits: {
      fileSize: limits.maxFileBytes,
      files: fileLimit,
      fields: MAX_TEXT_FIELDS,
      fieldSize: MAX_TEXT_FIELD_BYTES,
      fieldNameSize: 100,
      parts: fileLimit + MAX_TEXT_FIELDS,
      headerPairs: 100,
    },
    fileFilter(_req, file, cb) {
      const error = checkDeclaredType(file, allowedTypes);
      return error ? cb(error) : cb(null, true);
    },
  });

  const chain = (handler) => [
    guardRequestSize(limits),
    uploadGate(limits),
    runMulter(handler),
    validateFiles({ allowedTypes, limits, required }),
  ];

  return {
    single: (field) => chain(parser.single(field)),
    array: (field, count = fileLimit) => chain(parser.array(field, Math.min(count, fileLimit))),
    fields: (fields) =>
      chain(parser.fields(fields.map((f) => ({ name: f.name, maxCount: Math.min(f.maxCount ?? 1, fileLimit) })))),
  };
}
