export class ApiError extends Error {
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code ?? ApiError.defaultCode(statusCode);
    this.details = details;
    this.isOperational = true;
  }

  static defaultCode(statusCode) {
    const codes = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHENTICATED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codes[statusCode] ?? 'INTERNAL_ERROR';
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, message, { details });
  }

  static validation(details) {
    return new ApiError(400, 'Some fields are invalid', { code: 'VALIDATION_ERROR', details });
  }

  static unauthorized(message = 'Sign in to continue') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource already exists', details) {
    return new ApiError(409, message, { details });
  }

  static unavailable(message = 'Service temporarily unavailable') {
    return new ApiError(503, message);
  }
}
