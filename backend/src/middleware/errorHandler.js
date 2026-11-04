import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger, sanitizeUrl } from '../utils/logger.js';
import { DATABASE_RETRY_AFTER_SECONDS } from './common.js';
import { formatZodIssues } from './validate.js';

const DB_UNAVAILABLE_ERRORS = new Set([
  'MongoNotConnectedError',
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoPoolClearedError',
  'MongoTopologyClosedError',
]);

function normalizeError(error) {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) return ApiError.validation(formatZodIssues(error.issues));

  if (error instanceof mongoose.Error.ValidationError) {
    const details = Object.values(error.errors).map((e) => ({ field: e.path, message: e.message }));
    return ApiError.validation(details);
  }

  if (error instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for ${error.path}`);
  }

  if (error?.code === 11000) {
    const fields = Object.keys(error.keyValue ?? {});
    return ApiError.conflict(`A record with this ${fields.join(', ') || 'value'} already exists`, { fields });
  }

  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return new ApiError(status, error.message, { code: error.code });
  }

  if (DB_UNAVAILABLE_ERRORS.has(error?.name) || /before initial connection is complete/i.test(error?.message ?? '')) {
    return ApiError.unavailable('Database is unavailable. Try again shortly.');
  }

  if (error?.type === 'entity.parse.failed') return ApiError.badRequest('Request body is not valid JSON');
  if (error?.type === 'entity.too.large') return new ApiError(413, 'Request body is too large');

  return null;
}

export function errorHandler(error, req, res, next) {
  // A response was already sent (e.g. upload body timeout); let Express close the socket.
  if (res.headersSent) return next(error);
  const normalized = normalizeError(error);
  const statusCode = normalized?.statusCode ?? 500;

  // Route, status, request id and error class only: never the body, headers or query values.
  const where = `${req.method} ${sanitizeUrl(req.originalUrl)} ${statusCode} [${req.id ?? '-'}]`;
  if (!normalized) {
    logger.error(`${where} unhandled:`, error);
  } else if (statusCode >= 500) {
    logger.warn(`${where} ${normalized.code}: ${error?.name ?? 'Error'}`);
  }

  const body = {
    success: false,
    error: {
      code: normalized?.code ?? 'INTERNAL_ERROR',
      message: normalized?.message ?? 'Something went wrong on the server',
    },
  };
  if (normalized?.details) body.error.details = normalized.details;
  if (statusCode === 503 && !res.get('Retry-After')) res.set('Retry-After', String(DATABASE_RETRY_AFTER_SECONDS));
  if (!normalized && !env.isProduction) body.error.debug = { message: error?.message, stack: error?.stack };

  res.status(statusCode).json(body);
}
