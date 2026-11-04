import rateLimit from 'express-rate-limit';
import { isDatabaseConnected } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

export const DATABASE_RETRY_AFTER_SECONDS = 5;

/** Fails fast with 503 when MongoDB is not connected (e.g. it dropped after startup). */
export function requireDatabase(_req, res, next) {
  if (!isDatabaseConnected()) {
    res.set('Retry-After', String(DATABASE_RETRY_AFTER_SECONDS));
    throw ApiError.unavailable('Database is unavailable. Try again shortly.');
  }
  next();
}

export const RATE_LIMIT_MESSAGE = 'Too many requests. Wait a few minutes and try again.';

/**
 * Every limiter answers with the same 429 body, so a client cannot tell which limit (or
 * which account) tripped. express-rate-limit sets Retry-After before calling this.
 */
export const rateLimitHandler = (_req, _res, next) =>
  next(new ApiError(429, RATE_LIMIT_MESSAGE, { code: 'TOO_MANY_REQUESTS' }));

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler,
});
