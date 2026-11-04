import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'lumos-erp';

export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role?.key }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: ISSUER,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER });
}

function cookieOptions() {
  const sameSite = env.AUTH_COOKIE_SAMESITE;
  return {
    httpOnly: true,
    // SameSite=None is only accepted by browsers on secure cookies.
    secure: env.AUTH_COOKIE_SECURE || env.isProduction || sameSite === 'none',
    sameSite,
    path: '/',
  };
}

export function setAuthCookie(res, token) {
  const { exp } = jwt.decode(token);
  res.cookie(env.AUTH_COOKIE_NAME, token, { ...cookieOptions(), expires: new Date(exp * 1000) });
}

export function clearAuthCookie(res) {
  res.clearCookie(env.AUTH_COOKIE_NAME, cookieOptions());
}

export function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[env.AUTH_COOKIE_NAME] ?? null;
}
