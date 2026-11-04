import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { apiRateLimiter, notFound } from './middleware/common.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestId, requestLogger } from './middleware/requestLogging.js';
// Registers every Mongoose model up front so populate() can resolve cross-module refs.
import './models/index.js';
import apiRoutes from './routes/index.js';
import { ApiError } from './utils/ApiError.js';

/**
 * CORS only controls which browser origins may read responses; it is not access control.
 * Every protected route still requires authenticate + authorize. Requests without an
 * Origin header (curl, server-to-server, same-origin GET) pass and are authenticated as usual.
 * Requests from other browser origins are refused with 403 before reaching any route.
 */
function corsOptions() {
  return {
    origin(origin, callback) {
      if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
      return callback(new ApiError(403, 'This origin is not allowed to call the API', { code: 'CORS_ORIGIN_DENIED' }));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['Retry-After', 'RateLimit', 'RateLimit-Policy', 'X-Request-Id'],
    maxAge: 600,
  };
}

export function createApp() {
  const app = express();

  // req.ip (used by rate limits and audit logs) only honours X-Forwarded-For from trusted proxies.
  app.set('trust proxy', env.trustProxy);

  app.use(requestId);
  // Responses differ by Origin (including the 403 below), so caches must key on it.
  app.use((_req, res, next) => {
    res.vary('Origin');
    next();
  });
  app.use(helmet());
  app.use(cors(corsOptions()));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  if (!env.isTest) app.use(requestLogger({ production: env.isProduction }));

  app.use('/api/v1', apiRateLimiter, apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
