import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);
// Fail fast instead of queueing queries while disconnected; requireDatabase turns this into a 503.
mongoose.set('bufferCommands', false);

const READY_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

const MAX_RETRY_DELAY_MS = 30000;

let listenersAttached = false;
let shuttingDown = false;
let pendingConnect = null;
let cancelRetryWait = null;

/** Strips user:password from any MongoDB connection string embedded in a message. */
export function redactConnectionString(text) {
  return String(text ?? '').replace(/(mongodb(?:\+srv)?:\/\/)[^@/\s]+@/gi, '$1<credentials>@');
}

const safeMessage = (error) => redactConnectionString(error?.message ?? error);

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on('connected', () => {
    logger.info(`MongoDB connected (${mongoose.connection.host}/${mongoose.connection.name})`);
  });
  // Runtime drops are left to the driver's automatic reconnection; requests get 503 meanwhile.
  mongoose.connection.on('disconnected', () => {
    if (!shuttingDown) logger.warn('MongoDB disconnected; waiting for the driver to reconnect');
  });
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (error) => logger.error('MongoDB error:', safeMessage(error)));
}

function wait(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      cancelRetryWait = null;
      resolve();
    }
    cancelRetryWait = done;
  });
}

export class DatabaseConnectionError extends Error {
  constructor(attempts, cause) {
    super(`MongoDB connection failed after ${attempts} attempt(s): ${safeMessage(cause) || 'unknown error'}`);
    this.name = 'DatabaseConnectionError';
    this.attempts = attempts;
    this.causeName = cause?.name;
  }
}

async function connectWithRetry(uri, { dbName, maxAttempts, baseDelayMs, serverSelectionTimeoutMS }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS, maxPoolSize: 20 });
      return mongoose.connection;
    } catch (error) {
      if (shuttingDown) return null;
      logger.error(`MongoDB connection attempt ${attempt}/${maxAttempts} failed: ${safeMessage(error)}`);
      if (attempt >= maxAttempts) throw new DatabaseConnectionError(attempt, error);
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
      logger.info(`Retrying MongoDB connection in ${(delay / 1000).toFixed(1)}s`);
      await wait(delay);
      if (shuttingDown) return null;
    }
  }
  return null;
}

/**
 * Connects with exponential backoff and rejects with DatabaseConnectionError once
 * maxAttempts is exhausted. Resolves to null if disconnectDatabase() is called meanwhile.
 * Concurrent or repeated calls reuse the in-flight attempt or the open connection,
 * so the process never holds more than one connection pool.
 */
export function connectDatabase(
  uri,
  { dbName, maxAttempts = 5, baseDelayMs = 2000, serverSelectionTimeoutMS = 10000 } = {},
) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    return Promise.reject(new TypeError('maxAttempts must be a positive integer'));
  }
  if (pendingConnect) return pendingConnect;
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);

  attachListeners();
  shuttingDown = false;
  pendingConnect = connectWithRetry(uri, { dbName, maxAttempts, baseDelayMs, serverSelectionTimeoutMS }).finally(
    () => {
      pendingConnect = null;
    },
  );
  return pendingConnect;
}

export async function disconnectDatabase() {
  shuttingDown = true;
  cancelRetryWait?.();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
}

export function getDatabaseStatus() {
  return READY_STATES[mongoose.connection.readyState] ?? 'unknown';
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}
