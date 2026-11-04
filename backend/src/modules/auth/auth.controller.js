import { recordAudit } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { clearAuthCookie, setAuthCookie, signAccessToken } from '../../utils/token.js';
import * as authService from './auth.service.js';

export async function login(req, res) {
  const user = await authService.login(req.body);
  const token = signAccessToken(user);
  setAuthCookie(res, token);
  recordAudit(req, { actor: user._id, action: 'auth.login', module: 'auth', entityType: 'User', entityId: user._id });
  sendSuccess(res, { user: authService.toSessionUser(user) }, { message: 'Signed in' });
}

export function logout(req, res) {
  clearAuthCookie(res);
  sendSuccess(res, null, { message: 'Signed out' });
}

export function me(req, res) {
  sendSuccess(res, { user: authService.toSessionUser(req.user) });
}

export async function forgotPassword(req, res) {
  await authService.requestPasswordReset(req.body.email);
  sendSuccess(res, null, {
    message: 'If an account exists for that email, a password reset link has been sent.',
  });
}

export async function resetPassword(req, res) {
  const user = await authService.resetPassword(req.body);
  clearAuthCookie(res);
  recordAudit(req, { actor: user._id, action: 'auth.password_reset', module: 'auth', entityType: 'User', entityId: user._id });
  sendSuccess(res, null, { message: 'Password updated. Sign in with your new password.' });
}

export async function changePassword(req, res) {
  const user = await authService.changePassword(req.user._id, req.body);
  // The old token is now invalid (passwordChangedAt); issue a fresh one for this device.
  const fresh = await user.populate('role');
  setAuthCookie(res, signAccessToken(fresh));
  recordAudit(req, { action: 'auth.password_change', module: 'auth', entityType: 'User', entityId: user._id });
  sendSuccess(res, null, { message: 'Password changed' });
}

export async function updateProfile(req, res) {
  const user = await authService.updateProfile(req.user, req.body);
  recordAudit(req, { action: 'auth.profile_update', module: 'auth', entityType: 'User', entityId: user._id });
  sendSuccess(res, { user: authService.toSessionUser(user) }, { message: 'Profile updated' });
}
