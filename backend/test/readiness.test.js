import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { isDatabaseConnected } from '../src/config/db.js';
import { setAppReady } from '../src/config/lifecycle.js';

// No real MongoDB: the connection state is driven directly. Setting readyState emits the
// same connected/disconnected events Mongoose emits when the driver drops and reconnects.
const setDbState = (state) => {
  mongoose.connection.readyState = state;
};

let server;
let baseUrl;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  setDbState(0);
  setAppReady(false);
  await new Promise((resolve) => server.close(resolve));
});

const request = (path, init) =>
  fetch(`${baseUrl}${path}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });

// Every route mounted on the API router behind requireDatabase.
const DB_ROUTES = [
  ['POST', '/auth/login', { email: 'someone@example.com', password: 'whatever-password' }],
  ['POST', '/auth/logout'],
  ['POST', '/auth/forgot-password', { email: 'someone@example.com' }],
  ['POST', '/auth/reset-password', { token: 'a'.repeat(64), password: 'NewPassword-123' }],
  ['GET', '/auth/me'],
  ['PATCH', '/auth/me', { firstName: 'Name' }],
  ['POST', '/auth/change-password', { currentPassword: 'x', newPassword: 'NewPassword-123' }],
];

async function expectUnavailable(method, path, payload) {
  const res = await request(path, { method, body: payload ? JSON.stringify(payload) : undefined });
  const body = await res.json();
  assert.equal(res.status, 503, `${method} ${path}`);
  assert.equal(res.headers.get('retry-after'), '5');
  assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');
  assert.equal(body.error.debug, undefined);
  return body;
}

describe('ready: MongoDB connected and app started', () => {
  before(() => {
    setDbState(1);
    setAppReady(true);
  });

  it('/health returns 200', async () => {
    assert.equal((await request('/health')).status, 200);
  });

  for (const path of ['/ready', '/health/ready']) {
    it(`${path} returns 200`, async () => {
      const res = await request(path);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.data.ready, true);
      assert.equal(body.data.checks.database, 'connected');
    });
  }

  it('database-dependent routes pass the database guard', async () => {
    // Unauthenticated, so it stops at auth (401) rather than the database guard (503).
    assert.equal((await request('/auth/me')).status, 401);
  });
});

describe('runtime MongoDB disconnection', () => {
  before(() => setDbState(0));

  it('precondition: database is disconnected, app still marked ready', () => {
    assert.equal(isDatabaseConnected(), false);
  });

  it('/health stays 200 while the process is alive', async () => {
    const res = await request('/health');
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.status, 'degraded');
    assert.equal(body.data.checks.database, 'disconnected');
  });

  for (const path of ['/ready', '/health/ready']) {
    it(`${path} returns 503 with Retry-After`, async () => {
      const res = await request(path);
      assert.equal(res.status, 503);
      assert.equal(res.headers.get('retry-after'), '5');
      assert.equal((await res.json()).data.ready, false);
    });
  }

  for (const [method, path, payload] of DB_ROUTES) {
    it(`${method} ${path} returns 503`, () => expectUnavailable(method, path, payload));
  }

  it('responses do not leak configuration or secrets', async () => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'someone@example.com', password: 'whatever-password' }),
    });
    const text = await res.text();
    assert.ok(!text.includes(process.env.MONGODB_URI));
    assert.ok(!text.includes(process.env.JWT_SECRET));
  });

  for (const [state, label] of [
    [2, 'connecting / reconnecting'],
    [3, 'disconnecting (e.g. during shutdown)'],
  ]) {
    describe(`while MongoDB is ${label}`, () => {
      before(() => setDbState(state));
      after(() => setDbState(0));

      it('/health stays 200 and /ready is 503', async () => {
        assert.equal((await request('/health')).status, 200);
        assert.equal((await request('/ready')).status, 503);
      });

      for (const [method, path, payload] of DB_ROUTES) {
        it(`${method} ${path} returns 503`, () => expectUnavailable(method, path, payload));
      }
    });
  }

  it('recovers when Mongoose reconnects, without restarting the app', async () => {
    setDbState(2);
    assert.equal((await request('/ready')).status, 503, 'still 503 while reconnecting');
    setDbState(1);
    assert.equal((await request('/ready')).status, 200);
    assert.equal((await request('/auth/me')).status, 401);
  });
});

describe('ready while shutting down', () => {
  it('/ready returns 503 once the app is marked not ready, even with MongoDB up', async () => {
    setDbState(1);
    setAppReady(false);
    const res = await request('/ready');
    assert.equal(res.status, 503);
    assert.equal((await res.json()).data.checks.app, 'not_ready');
  });
});

describe('route mounting', () => {
  it('only health and readiness routes are mounted ahead of requireDatabase', async () => {
    const { default: apiRoutes } = await import('../src/routes/index.js');
    const { default: healthRoutes } = await import('../src/modules/health/health.routes.js');
    const { requireDatabase } = await import('../src/middleware/common.js');

    const guardIndex = apiRoutes.stack.findIndex((layer) => layer.handle === requireDatabase);
    assert.ok(guardIndex > 0, 'requireDatabase is mounted on the API router');

    const ahead = apiRoutes.stack.slice(0, guardIndex);
    for (const layer of ahead) {
      const isHealth = layer.handle === healthRoutes;
      const isReady = layer.route?.path === '/ready';
      assert.ok(isHealth || isReady, `unexpected route mounted before requireDatabase: ${layer.route?.path ?? layer.name}`);
    }
    assert.ok(apiRoutes.stack.length > guardIndex + 1, 'database routes are mounted after the guard');
  });
});

describe('driver errors thrown mid-request', () => {
  it('map to 503 without leaking the driver message', async () => {
    const express = (await import('express')).default;
    const { errorHandler } = await import('../src/middleware/errorHandler.js');
    const app = express();
    app.get('/boom', () => {
      throw Object.assign(new Error('connection to mongodb://u:pw@10.0.0.1 closed'), { name: 'MongoNetworkError' });
    });
    app.use(errorHandler);
    const local = app.listen(0);
    await new Promise((resolve) => local.once('listening', resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${local.address().port}/boom`);
      const text = await res.text();
      assert.equal(res.status, 503);
      assert.equal(res.headers.get('retry-after'), '5');
      assert.ok(!text.includes('pw@'));
    } finally {
      await new Promise((resolve) => local.close(resolve));
    }
  });
});
