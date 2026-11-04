import crypto from 'node:crypto';
import morgan from 'morgan';
import { logger, sanitizeUrl } from '../utils/logger.js';

const VALID_REQUEST_ID = /^[\w.-]{1,64}$/;

/** Reuses a well-formed upstream X-Request-Id (load balancer) or generates one. */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

morgan.token('id', (req) => req.id ?? '-');
morgan.token('safe-url', (req) => sanitizeUrl(req.originalUrl ?? req.url));

// No headers, cookies, bodies or Referer (it can carry a reset link); query values are redacted.
const FORMATS = {
  production: ':remote-addr :id ":method :safe-url HTTP/:http-version" :status :res[content-length] :response-time ms ":user-agent"',
  development: ':method :safe-url :status :response-time ms - :res[content-length] :id',
};

export function requestLogger({ production = false, write = (line) => logger.info(line) } = {}) {
  return morgan(production ? FORMATS.production : FORMATS.development, {
    stream: { write: (line) => write(line.trimEnd()) },
  });
}
