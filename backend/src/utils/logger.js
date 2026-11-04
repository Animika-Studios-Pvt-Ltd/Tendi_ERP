/*
 * Minimal leveled logger. Swap for pino/winston when log shipping is introduced.
 *
 * Every argument is redacted before it is written, as a safety net for callers:
 * credentials in URLs, JWTs, bearer tokens, password/token/secret/cookie key-value pairs,
 * 64-hex reset tokens, Cloudinary signing details, configured secret values and email
 * local parts. Error objects are reduced to name, code and message (stack outside
 * production) so provider/driver errors cannot dump request options or credentials.
 */
const REDACTED = '[REDACTED]';
const timestamp = () => new Date().toISOString();

const SENSITIVE_KEY =
  /pass(word|wd)?|token|secret|authorization|cookie|api[_-]?key|signature|jwt|session|credential|set-cookie/i;

const PATTERNS = [
  // scheme://user:password@host (MongoDB, Cloudinary, Redis, SMTP, ...)
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi, `$1${REDACTED}@`],
  [/\b(mongodb(?:\+srv)?:\/\/)[^\s@/]+@/gi, `$1${REDACTED}@`],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED],
  [/\b(Bearer|Basic)\s+[\w.~+/=-]+/gi, `$1 ${REDACTED}`],
  [
    /\b([\w-]*(?:pass(?:word|wd)?|token|secret|api[_-]?key|signature|authorization|cookie|jwt|session)[\w-]*)(["']?\s*[:=]\s*["']?)([^\s"'&,;}]+)/gi,
    `$1$2${REDACTED}`,
  ],
  [/String to sign - '[^']*'/g, `String to sign - '${REDACTED}'`],
  [/\b[a-f0-9]{64}\b/gi, REDACTED],
  // Keep the first character and domain: enough to correlate, not to identify.
  [/\b([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/g, '$1***@$2'],
];

const SECRET_ENV_KEYS = [
  'JWT_SECRET',
  'MONGODB_URI',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_URL',
  'SEED_ADMIN_PASSWORD',
];

function secretValues() {
  return SECRET_ENV_KEYS.map((key) => process.env[key]).filter((value) => typeof value === 'string' && value.length >= 6);
}

export function redactSensitive(text) {
  let out = String(text);
  for (const secret of secretValues()) out = out.split(secret).join(REDACTED);
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

function formatError(error) {
  const head = [error.name || 'Error', error.code !== undefined ? `[${error.code}]` : null].filter(Boolean).join(' ');
  if (process.env.NODE_ENV !== 'production' && error.stack) {
    return redactSensitive(error.stack.replace(/^[^\n]*/, `${head}: ${error.message}`));
  }
  return redactSensitive(`${head}: ${error.message}`);
}

function formatObject(value) {
  const seen = new WeakSet();
  try {
    return redactSensitive(
      JSON.stringify(value, (key, item) => {
        if (key && SENSITIVE_KEY.test(key)) return REDACTED;
        if (item instanceof Error) return formatError(item);
        if (item && typeof item === 'object') {
          if (seen.has(item)) return '[Circular]';
          seen.add(item);
        }
        return item;
      }),
    );
  } catch {
    return '[Unserializable]';
  }
}

function formatArg(value) {
  if (value instanceof Error) return formatError(value);
  if (value && typeof value === 'object') return formatObject(value);
  return redactSensitive(value);
}

const write = (sink, label, args) => sink(`[${timestamp()}] ${label}`, ...args.map(formatArg));

/**
 * Keeps the path, drops fragments, and redacts every query value except a few harmless
 * listing parameters, so tokens, emails or search terms in URLs never reach the logs.
 */
const SAFE_QUERY_KEYS = new Set(['page', 'limit', 'sort', 'order', 'status']);
export function sanitizeUrl(url) {
  const raw = String(url ?? '');
  const [path, query] = raw.split('#')[0].split(/\?(.*)/s);
  if (query === undefined) return redactSensitive(path);
  const params = query
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const [key] = pair.split('=');
      return SAFE_QUERY_KEYS.has(key) ? pair : `${key}=${REDACTED}`;
    });
  return redactSensitive(`${path}?${params.join('&')}`);
}

export const logger = {
  info: (...args) => write(console.log, 'INFO ', args),
  warn: (...args) => write(console.warn, 'WARN ', args),
  error: (...args) => write(console.error, 'ERROR', args),
  debug: (...args) => {
    if (process.env.NODE_ENV === 'development') write(console.debug, 'DEBUG', args);
  },
};
