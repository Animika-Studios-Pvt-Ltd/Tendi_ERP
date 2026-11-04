// A. Importing env validates configuration and exits(1) on invalid values.
import { env } from './config/env.js';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createShutdown, registerProcessHandlers, startServer } from './startup.js';
import { logger } from './utils/logger.js';

let server = null;
const shutdown = createShutdown({
  getServer: () => server,
  disconnect: disconnectDatabase,
  timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
});

// B. Handlers are in place before any async work starts.
registerProcessHandlers(shutdown, { includeStack: !env.isProduction });

try {
  // C-E. MongoDB first, then the Express app, then the HTTP port.
  server = await startServer({
    createApp,
    port: env.PORT,
    connect: () =>
      connectDatabase(env.MONGODB_URI, {
        dbName: env.MONGODB_DB_NAME,
        maxAttempts: env.mongoConnectMaxAttempts,
        baseDelayMs: env.MONGODB_CONNECT_RETRY_BASE_MS,
        serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
      }),
  });

  if (server) {
    logger.info(`${env.APP_NAME} API listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
    server.on('error', (error) => {
      logger.error('HTTP server error:', error.message);
      shutdown('serverError', 1);
    });
  }
} catch (error) {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${env.PORT} is already in use. Set a different PORT in backend/.env.`);
  } else {
    // DatabaseConnectionError messages are already stripped of credentials.
    logger.error('Startup failed; HTTP port was not opened:', error.message);
  }
  await shutdown('startupFailure', 1);
}
