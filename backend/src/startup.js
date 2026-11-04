import { setAppReady } from './config/lifecycle.js';
import { redactConnectionString } from './config/db.js';
import { logger } from './utils/logger.js';

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10000;

const safeMessage = (error) => redactConnectionString(error?.message ?? error);
// Stack traces are useful in development logs; production logs keep only the message.
const describeError = (error, { includeStack }) =>
  includeStack && error?.stack ? redactConnectionString(error.stack) : safeMessage(error);

function listen(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

/**
 * Stops accepting new connections and resolves once every active request has finished.
 * Idle keep-alive sockets are closed immediately so they cannot hold the server open.
 */
function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server?.listening) return resolve();
    server.close((error) => {
      if (!error || error.code === 'ERR_SERVER_NOT_RUNNING') return resolve();
      return reject(error);
    });
    server.closeIdleConnections?.();
  });
}

/**
 * A. env is validated on import of config/env.js, before this runs.
 * C. Connect to MongoDB (with retries inside `connect`).
 * D. Create the Express app only after the connection succeeded.
 * E. Bind the port and mark the app ready.
 * Rejects without ever listening if the connection fails; resolves null if shutdown
 * began while connecting.
 */
export async function startServer({ createApp, connect, port }) {
  const connection = await connect();
  if (!connection) return null;

  const app = createApp();
  const server = await listen(app, port);
  setAppReady(true);
  return server;
}

/**
 * Builds the single shutdown routine for the process:
 *   1. mark not ready (readiness probes return 503 immediately),
 *   2. stop accepting connections and wait for active requests,
 *   3. close MongoDB, 4. exit.
 * Runs once; later calls return the same promise but can raise the exit code to 1
 * (e.g. a crash during a SIGTERM drain). If draining exceeds timeoutMs, remaining
 * sockets are destroyed and the process exits 1.
 */
export function createShutdown({
  getServer,
  disconnect,
  exit = process.exit,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
}) {
  let pending = null;
  let finalCode = 0;
  let exited = false;

  const exitOnce = (code) => {
    if (exited) return;
    exited = true;
    exit(code);
  };

  return function shutdown(reason, exitCode = 0) {
    finalCode = Math.max(finalCode, exitCode);
    if (pending) return pending;

    setAppReady(false);
    logger.info(`Shutting down (${reason})`);

    const forceExit = setTimeout(() => {
      logger.error(`Shutdown did not finish within ${timeoutMs}ms; closing remaining connections and exiting`);
      getServer()?.closeAllConnections?.();
      exitOnce(1);
    }, timeoutMs);
    forceExit.unref?.();

    pending = (async () => {
      try {
        await closeServer(getServer());
      } catch (error) {
        logger.error('Error closing HTTP server:', safeMessage(error));
        finalCode = 1;
      }
      try {
        await disconnect();
      } catch (error) {
        logger.error('Error closing MongoDB connection:', safeMessage(error));
        finalCode = 1;
      }
      clearTimeout(forceExit);
      logger.info(`Shutdown complete (exit ${finalCode})`);
      exitOnce(finalCode);
    })();
    return pending;
  };
}

/**
 * B. SIGINT/SIGTERM shut down with exit 0. Unhandled rejections and uncaught exceptions
 * leave the process in an unknown state, so they shut down with exit 1.
 */
export function registerProcessHandlers(shutdown, { proc = process, includeStack = false } = {}) {
  proc.on('SIGINT', () => shutdown('SIGINT', 0));
  proc.on('SIGTERM', () => shutdown('SIGTERM', 0));
  proc.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection:', describeError(reason, { includeStack }));
    shutdown('unhandledRejection', 1);
  });
  proc.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', describeError(error, { includeStack }));
    shutdown('uncaughtException', 1);
  });
}
