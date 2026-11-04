/**
 * Every successful response uses { success: true, data, meta?, message? }.
 * Errors use { success: false, error: { code, message, details? } } (see errorHandler).
 */
export function sendSuccess(res, data = null, { status = 200, meta, message } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  if (message) body.message = message;
  return res.status(status).json(body);
}
