import net from 'node:net';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Why `entry` is not a usable CORS origin, or null. Browsers compare origins exactly. */
export function originProblem(entry) {
  let url;
  try {
    url = new URL(entry);
  } catch {
    return 'is not a valid URL';
  }
  if (!['http:', 'https:'].includes(url.protocol)) return 'must use http:// or https://';
  if (url.origin !== entry) {
    return `must be written exactly as the browser sends it, without path or trailing slash: ${url.origin}`;
  }
  return null;
}

const PROXY_PRESETS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/** IP, CIDR (IPv4 /0-32, IPv6 /0-128) or an Express trust-proxy preset name. */
export function isProxyAddress(entry) {
  if (PROXY_PRESETS.has(entry)) return true;
  const [ip, prefix, extra] = entry.split('/');
  const family = net.isIP(ip);
  if (!family || extra !== undefined) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (family === 4 ? 32 : 128);
}

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  APP_NAME: z.string().default('Ten.Di ERP'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().optional(),
  // Startup connection policy. Unset attempts default to 5 in production, 10 elsewhere.
  MONGODB_CONNECT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).optional(),
  MONGODB_CONNECT_RETRY_BASE_MS: z.coerce.number().int().min(10).default(2000),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(10000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).default(10000),

  // Exact browser origins allowed by CORS (scheme://host[:port], no path), comma separated.
  CLIENT_URL: z
    .string()
    .default('http://localhost:5173')
    .superRefine((value, ctx) => {
      for (const entry of splitList(value)) {
        const problem = originProblem(entry);
        if (problem) ctx.addIssue({ code: 'custom', message: `"${entry}" ${problem}` });
      }
    }),
  // Reverse proxies whose X-Forwarded-For is trusted for the client IP (rate limits, audit).
  // "false", a hop count, or a comma list of IPs/CIDRs/presets (loopback, linklocal, uniquelocal).
  // Required in production; unset elsewhere means none. "true" is refused: any client could spoof its IP.
  TRUST_PROXY: z
    .string()
    .trim()
    .refine((value) => value !== 'true', 'Use a hop count or proxy addresses instead of "true"')
    .refine(
      (value) => value === 'false' || /^\d{1,2}$/.test(value) || splitList(value).every(isProxyAddress),
      'Use "false", a hop count, or a comma-separated list of IPs, CIDRs or loopback/linklocal/uniquelocal',
    )
    .optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  AUTH_COOKIE_NAME: z.string().default('lumos_session'),
  AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  AUTH_COOKIE_SECURE: booleanString,

  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  // Development only, until email delivery exists: print reset links to the API console.
  LOG_PASSWORD_RESET_LINKS: booleanString,
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  STORAGE_PROVIDER: z.enum(['cloudinary', 's3']).default('cloudinary'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i, 'Use letters, numbers, "-", "_" and "/" only')
    .default('lumos-erp'),
  // Upload limits. Worst-case buffered memory is MAX_CONCURRENT_UPLOADS x MAX_UPLOAD_TOTAL_MB.
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().max(100).default(10),
  MAX_UPLOAD_FILES: z.coerce.number().int().min(1).max(20).default(10),
  MAX_UPLOAD_TOTAL_MB: z.coerce.number().positive().max(200).default(25),
  MAX_CONCURRENT_UPLOADS: z.coerce.number().int().min(1).max(50).default(4),
  MAX_CONCURRENT_UPLOADS_PER_USER: z.coerce.number().int().min(1).max(50).default(2),
  // Whole request body must arrive within this time. 120s covers 25 MB at ~2 Mbit/s.
  UPLOAD_BODY_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(900).default(120),
  FILE_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),

  SEED_ADMIN_EMAIL: z.email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(10).optional(),
  SEED_ADMIN_FIRST_NAME: z.string().default('System'),
  SEED_ADMIN_LAST_NAME: z.string().default('Administrator'),
})
  .refine((value) => value.MAX_UPLOAD_TOTAL_MB >= value.MAX_UPLOAD_SIZE_MB, {
    path: ['MAX_UPLOAD_TOTAL_MB'],
    message: 'Must be at least MAX_UPLOAD_SIZE_MB',
  })
  .refine((value) => value.MAX_CONCURRENT_UPLOADS_PER_USER <= value.MAX_CONCURRENT_UPLOADS, {
    path: ['MAX_CONCURRENT_UPLOADS_PER_USER'],
    message: 'Must not exceed MAX_CONCURRENT_UPLOADS',
  })
  // A wrong guess either lets clients spoof their IP (no proxy) or puts everyone in one bucket.
  .refine((value) => value.NODE_ENV !== 'production' || value.TRUST_PROXY !== undefined, {
    path: ['TRUST_PROXY'],
    message: 'Set TRUST_PROXY in production to match the proxy topology ("false" if clients connect directly)',
  })
  .refine((value) => value.NODE_ENV !== 'production' || splitList(value.CLIENT_URL).every((o) => o.startsWith('https://')), {
    path: ['CLIENT_URL'],
    message: 'Production origins must use https://',
  });

// Treat blank values in .env (e.g. "CLOUDINARY_API_KEY=") as unset.
const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, value === '' ? undefined : value]),
);

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  console.error('Invalid environment configuration. Check backend/.env against backend/.env.example:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const data = parsed.data;

export const env = Object.freeze({
  ...data,
  isProduction: data.NODE_ENV === 'production',
  isDevelopment: data.NODE_ENV === 'development',
  isTest: data.NODE_ENV === 'test',
  mongoConnectMaxAttempts: data.MONGODB_CONNECT_MAX_ATTEMPTS ?? (data.NODE_ENV === 'production' ? 5 : 10),
  clientOrigins: Object.freeze(splitList(data.CLIENT_URL)),
  primaryClientUrl: splitList(data.CLIENT_URL)[0],
  trustProxy: parseTrustProxy(data.TRUST_PROXY, data.NODE_ENV === 'production'),
});

/** Converts TRUST_PROXY into the value Express' "trust proxy" setting expects. */
export function parseTrustProxy(value, isProduction) {
  // Production startup refuses an unset value; 1 hop only applies when called directly.
  if (value === undefined) return isProduction ? 1 : false;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return splitList(value);
}
