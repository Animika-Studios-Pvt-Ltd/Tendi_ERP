import './setup-env.js';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import {
  connectDatabase,
  DatabaseConnectionError,
  disconnectDatabase,
  getDatabaseStatus,
  isDatabaseConnected,
  redactConnectionString,
} from '../src/config/db.js';

const SECRET = 'S3cretPassw0rd';
const UNREACHABLE_URI = `mongodb://tenditest:${SECRET}@127.0.0.1:1/tendi_erp_test?authSource=admin`;
const FAST = { serverSelectionTimeoutMS: 200, baseDelayMs: 10 };

describe('connectDatabase retry exhaustion', () => {
  after(() => disconnectDatabase());

  it('rejects with DatabaseConnectionError after exactly maxAttempts', async () => {
    const started = Date.now();
    await assert.rejects(connectDatabase(UNREACHABLE_URI, { ...FAST, maxAttempts: 3 }), (error) => {
      assert.ok(error instanceof DatabaseConnectionError);
      assert.equal(error.attempts, 3);
      assert.ok(!error.message.includes(SECRET), 'error message must not contain the password');
      assert.equal(error.cause, undefined, 'raw driver error is not attached');
      return true;
    });
    // 3 selection timeouts (~600ms) + backoff 10ms + 20ms
    assert.ok(Date.now() - started < 5000);
    assert.equal(isDatabaseConnected(), false);
    assert.equal(getDatabaseStatus(), 'disconnected');
  });

  it('refuses an unbounded or invalid retry count', async () => {
    await assert.rejects(connectDatabase(UNREACHABLE_URI, { maxAttempts: Number.POSITIVE_INFINITY }), TypeError);
    await assert.rejects(connectDatabase(UNREACHABLE_URI, { maxAttempts: 0 }), TypeError);
  });

  it('reuses the in-flight attempt instead of opening a second connection', async () => {
    const first = connectDatabase(UNREACHABLE_URI, { ...FAST, maxAttempts: 1 });
    const second = connectDatabase(UNREACHABLE_URI, { ...FAST, maxAttempts: 1 });
    assert.equal(first, second);
    await assert.rejects(first, DatabaseConnectionError);
  });

  it('stops retrying and resolves null when shutdown starts during backoff', async () => {
    const pending = connectDatabase(UNREACHABLE_URI, { serverSelectionTimeoutMS: 200, baseDelayMs: 60000, maxAttempts: 3 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const started = Date.now();
    await disconnectDatabase();
    assert.equal(await pending, null);
    assert.ok(Date.now() - started < 5000, 'backoff wait was cancelled');
  });
});

describe('redactConnectionString', () => {
  it('removes credentials from mongodb and mongodb+srv URIs', () => {
    assert.equal(
      redactConnectionString('failed mongodb+srv://user:pa55@cluster0.example.net/db'),
      'failed mongodb+srv://<credentials>@cluster0.example.net/db',
    );
    assert.equal(redactConnectionString('mongodb://u:p@h:27017'), 'mongodb://<credentials>@h:27017');
    assert.equal(redactConnectionString('no uri here'), 'no uri here');
  });
});
