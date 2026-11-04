import { z } from 'zod';

/** Client-side mirrors of server rules (backend/src/modules/auth/auth.validator.js). */
export const emailField = z.email('Enter a valid email address').trim();

export const passwordField = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number');

export const PASSWORD_HINT = 'At least 10 characters with an uppercase letter, a lowercase letter and a number.';

/** Pushes server-side field errors from an ApiRequestError into react-hook-form. */
export function applyServerErrors(error, setError) {
  const fieldErrors = error?.fieldErrors ?? {};
  Object.entries(fieldErrors).forEach(([field, message]) => setError(field, { type: 'server', message }));
  return Object.keys(fieldErrors).length > 0;
}
