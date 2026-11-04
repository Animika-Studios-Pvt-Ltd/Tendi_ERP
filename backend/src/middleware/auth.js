import { User, USER_STATUS } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { extractToken, verifyAccessToken } from '../utils/token.js';

/** Verifies the JWT and attaches the active user (with role) to req.user. */
export async function authenticate(req, _res, next) {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Your session has expired. Sign in again.');
  }

  const user = await User.findById(payload.sub).populate('role');
  if (!user || user.status !== USER_STATUS.ACTIVE || !user.role?.isActive) {
    throw ApiError.unauthorized('Your account is not active. Contact your administrator.');
  }

  if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime()) {
    throw ApiError.unauthorized('Your password was changed. Sign in again.');
  }

  req.user = user;
  next();
}

/**
 * Route-level permission check, e.g. authorize('procurement', 'approve').
 * Pass several actions to allow any of them.
 */
export function authorize(module, ...actions) {
  const required = actions.length ? actions : ['read'];
  return (req, _res, next) => {
    const role = req.user?.role;
    if (!role) throw ApiError.unauthorized();
    if (!required.some((action) => role.can(module, action))) {
      throw ApiError.forbidden(`Your role cannot ${required.join(' or ')} in ${module}`);
    }
    next();
  };
}

/** Restricts a route to specific role keys (use sparingly; prefer authorize()). */
export function requireRole(...roleKeys) {
  return (req, _res, next) => {
    if (!roleKeys.includes(req.user?.role?.key)) throw ApiError.forbidden();
    next();
  };
}
