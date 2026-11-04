import crypto from 'node:crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { rateLimitHandler } from './common.js';

/*
 * Authentication rate limits (in-memory, per process).
 *
 *   endpoint                 key            limit                       counts
 *   POST /auth/login         client IP      20 per 15 min               failed attempts
 *   POST /auth/login         email          5 per 15 min                failed attempts
 *   POST /auth/forgot-pw     client IP      5 per hour                  every request
 *   POST /auth/forgot-pw     email          3 per hour                  every request
 *   POST /auth/reset-pw      client IP      10 per hour                 every request
 *   POST /auth/change-pw     signed-in user 5 per 15 min                failed attempts
 *
 * Email keys apply identically to registered and unknown addresses, so a 429 never reveals
 * whether an account exists. Counting only failed logins keeps an office of users behind
 * one NAT address from locking each other out.
 */

const MINUTE = 60 * 1000;

export const AUTH_RATE_LIMITS = Object.freeze({
  loginPerIp: { windowMs: 15 * MINUTE, limit: 20 },
  loginPerEmail: { windowMs: 15 * MINUTE, limit: 5 },
  forgotPasswordPerIp: { windowMs: 60 * MINUTE, limit: 5 },
  forgotPasswordPerEmail: { windowMs: 60 * MINUTE, limit: 3 },
  resetPasswordPerIp: { windowMs: 60 * MINUTE, limit: 10 },
  changePasswordPerUser: { windowMs: 15 * MINUTE, limit: 5 },
});

const clientIpKey = (req) => `ip:${ipKeyGenerator(req.ip ?? '')}`;

/** Hashed so the limiter's memory never holds plaintext addresses. */
function emailKey(req) {
  const email = req.body?.email;
  if (typeof email !== 'string' || !email.trim()) return clientIpKey(req);
  const digest = crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  return `email:${digest}`;
}

const userKey = (req) => (req.user?._id ? `user:${req.user._id}` : clientIpKey(req));

function limiter({ windowMs, limit }, { keyGenerator = clientIpKey, failuresOnly = false } = {}) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator,
    skipSuccessfulRequests: failuresOnly,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: rateLimitHandler,
  });
}

export const loginRateLimit = [
  limiter(AUTH_RATE_LIMITS.loginPerIp, { failuresOnly: true }),
  limiter(AUTH_RATE_LIMITS.loginPerEmail, { keyGenerator: emailKey, failuresOnly: true }),
];

export const forgotPasswordRateLimit = [
  limiter(AUTH_RATE_LIMITS.forgotPasswordPerIp),
  limiter(AUTH_RATE_LIMITS.forgotPasswordPerEmail, { keyGenerator: emailKey }),
];

export const resetPasswordRateLimit = [limiter(AUTH_RATE_LIMITS.resetPasswordPerIp)];

/** Must run after authenticate(). */
export const changePasswordRateLimit = [
  limiter(AUTH_RATE_LIMITS.changePasswordPerUser, { keyGenerator: userKey, failuresOnly: true }),
];
