import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { env } from '../../config/env.js';
import { hashToken, User, USER_STATUS } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
const INVALID_CREDENTIALS = 'Email or password is incorrect';

/** Shape sent to the client: profile, role and a { module: actions[] } effective permission map. */
export function toSessionUser(user) {
  const role = user.role;
  const effectivePermissions = typeof user.toEffectivePermissionMap === 'function'
    ? user.toEffectivePermissionMap()
    : role?.toPermissionMap
      ? role.toPermissionMap()
      : {};

  return {
    id: String(user._id),
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? '',
    designation: user.designation ?? '',
    avatarUrl: user.avatar?.url ?? null,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    assignedProjects: (user.assignedProjects ?? []).map(String),
    role: { key: role.key, name: role.name, dataScope: role.dataScope },
    permissions: effectivePermissions,
    permissionOverrides: (user.permissionOverrides ?? []).map((o) => ({
      module: o.module,
      action: o.action,
      granted: o.granted,
    })),
  };
}

// Unknown emails are checked against this hash so they cost the same bcrypt time as real ones.
let dummyPasswordHash;
const getDummyPasswordHash = () =>
  (dummyPasswordHash ??= bcrypt.hash(crypto.randomBytes(16).toString('hex'), env.BCRYPT_SALT_ROUNDS));

/**
 * Unknown email, wrong password and locked account all produce the same 401 after a bcrypt
 * comparison, so neither the response nor its timing reveals whether an account exists.
 * Lockout is still enforced: a locked account cannot sign in even with the right password.
 */
export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+password +failedLoginAttempts +lockUntil').populate('role');

  if (!user) {
    await bcrypt.compare(password, await getDummyPasswordHash());
    throw ApiError.unauthorized(INVALID_CREDENTIALS);
  }

  const valid = await user.comparePassword(password);
  if (user.isLocked) throw ApiError.unauthorized(INVALID_CREDENTIALS);
  if (!valid) {
    await user.registerFailedLogin();
    throw ApiError.unauthorized(INVALID_CREDENTIALS);
  }

  if (user.status !== USER_STATUS.ACTIVE || !user.role?.isActive) {
    throw ApiError.forbidden('Your account is not active. Contact your administrator.');
  }

  await user.registerSuccessfulLogin();
  return user;
}

/**
 * Always resolves so the response never reveals whether an email is registered.
 * Email delivery is not wired up yet; in development the reset link can be printed by
 * setting LOG_PASSWORD_RESET_LINKS=true.
 */
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email, status: USER_STATUS.ACTIVE });
  if (!user) return;

  const token = user.createPasswordResetToken();
  await user.save({ validateModifiedOnly: true });

  // The link is a live credential: never logged unless explicitly enabled in development.
  // console is used directly because the logger would redact the token.
  if (env.isDevelopment && env.LOG_PASSWORD_RESET_LINKS) {
    console.info(`[dev] Password reset link: ${env.primaryClientUrl}/reset-password?token=${token}`);
  }
  // TODO(notifications): send resetUrl through the email service once it exists.
}

export async function resetPassword({ token, password }) {
  const user = await User.findOne({
    passwordResetTokenHash: hashToken(token),
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpiresAt');

  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired. Request a new one.');

  user.password = password;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();
  return user;
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw ApiError.unauthorized();

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.validation([{ field: 'currentPassword', message: 'Current password is incorrect' }]);
  }

  user.password = newPassword;
  await user.save();
  return user;
}

export async function updateProfile(user, changes) {
  Object.assign(user, changes, { updatedBy: user._id });
  await user.save();
  return user;
}
