import { Router } from 'express';
import { getDatabaseStatus, isDatabaseConnected } from '../../config/db.js';
import { env } from '../../config/env.js';
import { isAppReady } from '../../config/lifecycle.js';
import { getStorageStatus } from '../../services/storage/index.js';
import { sendSuccess } from '../../utils/apiResponse.js';

const router = Router();
const startedAt = new Date();

function buildReport() {
  const database = getDatabaseStatus();
  return {
    status: database === 'connected' ? 'ok' : 'degraded',
    service: env.APP_NAME,
    version: process.env.npm_package_version ?? '0.1.0',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks: {
      api: 'up',
      database,
      storage: getStorageStatus(),
    },
  };
}

// Liveness: the process is serving requests. Always 200.
router.get('/', (_req, res) => sendSuccess(res, buildReport()));

/**
 * Readiness: 200 only when MongoDB is connected and the app finished starting and is
 * not shutting down. Mounted at /health/ready and /ready.
 */
export function readinessHandler(_req, res) {
  const ready = isDatabaseConnected() && isAppReady();
  const report = { ...buildReport(), ready };
  report.checks.app = isAppReady() ? 'ready' : 'not_ready';
  if (!ready) res.set('Retry-After', '5');
  sendSuccess(res, report, { status: ready ? 200 : 503 });
}

router.get('/ready', readinessHandler);

export default router;
