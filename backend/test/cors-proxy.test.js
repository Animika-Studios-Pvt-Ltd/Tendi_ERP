import './setup-cors-env.js';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { after, before, describe, it, mock } from 'node:test';
import express from 'express';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { isProxyAddress, originProblem, parseTrustProxy } from '../src/config/env.js';
import { User } from '../src/models/User.js';

const ALLOWED = 'http://localhost:5173';
const SECOND_ALLOWED = 'https://erp.example.com';

let server;
let baseUrl;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  mongoose.connection.readyState = 0;
  await new Promise((resolve) => server.close(resolve));
});

const call = (path, { method = 'GET', headers = {}, body } = {}) =>
  fetch(`${baseUrl}${path}`, { method, headers, body });

const preflight = (origin, requestMethod = 'POST', requestHeaders = 'content-type') =>
  call('/auth/login', {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': requestMethod, 'access-control-request-headers': requestHeaders },
  });

const header = (res, name) => res.headers.get(name);
const listHeader = (res, name) => (header(res, name) ?? '').toLowerCase().split(/\s*,\s*/);

describe('CORS: allowed origins', () => {
  for (const origin of [ALLOWED, SECOND_ALLOWED]) {
    it(`${origin} receives its own origin back with credentials`, async () => {
      const res = await call('/health', { headers: { origin } });
      assert.equal(res.status, 200);
      assert.equal(header(res, 'access-control-allow-origin'), origin, 'never "*" with credentials');
      assert.equal(header(res, 'access-control-allow-credentials'), 'true');
      assert.ok(listHeader(res, 'vary').includes('origin'));
      assert.ok(listHeader(res, 'access-control-expose-headers').includes('retry-after'));
      assert.ok(listHeader(res, 'access-control-expose-headers').includes('x-request-id'));
    });
  }
});

describe('CORS: rejected origins', () => {
  const REJECTED = [
    'https://evil.example',
    'null', // sandboxed iframes, file:// pages
    'http://localhost:5173.evil.example', // prefix trick
    'http://evil.localhost:5173', // subdomain trick
    'http://localhost:5174', // other port
    'https://localhost:5173', // other scheme
    'http://erp.example.com', // allowed host over http
  ];

  for (const origin of REJECTED) {
    it(`${origin} gets 403 with no CORS grant`, async () => {
      const res = await call('/health', { headers: { origin } });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.error.code, 'CORS_ORIGIN_DENIED');
      assert.equal(header(res, 'access-control-allow-origin'), null);
      assert.equal(header(res, 'access-control-allow-credentials'), null);
      assert.ok(listHeader(res, 'vary').includes('origin'), 'caches must not reuse the 403 for other origins');
      assert.ok(!JSON.stringify(body).includes(origin), 'origin is not reflected');
    });
  }

  it('a request from a rejected origin never reaches the route handler', async (t) => {
    mongoose.connection.readyState = 1;
    const findOne = t.mock.method(User, 'findOne', () => {
      throw new Error('handler must not run');
    });
    const res = await call('/auth/login', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'victim@example.com', password: 'guess-password' }),
    });
    assert.equal(res.status, 403);
    assert.equal(findOne.mock.callCount(), 0);
    mongoose.connection.readyState = 0;
  });
});

describe('CORS: preflight', () => {
  it('approves allowed origins for every API method and the Authorization header', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await preflight(ALLOWED, method, 'authorization,content-type');
      assert.equal(res.status, 204, method);
      assert.equal(header(res, 'access-control-allow-origin'), ALLOWED);
      assert.equal(header(res, 'access-control-allow-credentials'), 'true');
      assert.ok(listHeader(res, 'access-control-allow-methods').includes(method.toLowerCase()));
      assert.ok(listHeader(res, 'access-control-allow-headers').includes('authorization'));
      assert.ok(listHeader(res, 'access-control-allow-headers').includes('content-type'));
      assert.equal(header(res, 'access-control-max-age'), '600');
    }
  });

  it('does not echo arbitrary requested headers', async () => {
    const res = await preflight(ALLOWED, 'POST', 'x-evil-header');
    assert.equal(res.status, 204);
    assert.ok(!listHeader(res, 'access-control-allow-headers').includes('x-evil-header'));
  });

  it('refuses preflight from an unapproved origin', async () => {
    const res = await preflight('https://evil.example', 'DELETE', 'authorization');
    assert.equal(res.status, 403);
    assert.equal(header(res, 'access-control-allow-origin'), null);
    assert.equal(header(res, 'access-control-allow-methods'), null);
  });
});

describe('CORS is not authentication', () => {
  it('requests without an Origin header (curl, server-to-server) are served without CORS headers', async () => {
    const res = await call('/health');
    assert.equal(res.status, 200);
    assert.equal(header(res, 'access-control-allow-origin'), null);
  });

  it('an allowed origin still needs a valid session for protected routes', async () => {
    mongoose.connection.readyState = 1;
    const withOrigin = await call('/auth/me', { headers: { origin: ALLOWED } });
    const withoutOrigin = await call('/auth/me');
    assert.equal(withOrigin.status, 401);
    assert.equal(withoutOrigin.status, 401);
    mongoose.connection.readyState = 0;
  });
});

describe('client IP detection by proxy topology', () => {
  async function ipSeen(trustProxyValue, forwardedFor) {
    const app = express();
    app.set('trust proxy', parseTrustProxy(trustProxyValue, false));
    app.get('/', (req, res) => res.json({ ip: req.ip }));
    const local = app.listen(0);
    await new Promise((resolve) => local.once('listening', resolve));
    try {
      const headers = forwardedFor ? { 'x-forwarded-for': forwardedFor } : {};
      const res = await fetch(`http://127.0.0.1:${local.address().port}/`, { headers });
      return (await res.json()).ip.replace(/^::ffff:/, '');
    } finally {
      await new Promise((resolve) => local.close(resolve));
    }
  }

  it('no trusted proxy: a spoofed X-Forwarded-For is ignored', async () => {
    assert.equal(await ipSeen('false', '1.2.3.4'), '127.0.0.1');
    assert.equal(await ipSeen(undefined, '1.2.3.4'), '127.0.0.1', 'non-production default');
  });

  it('one hop (single load balancer): only the address the proxy appended is used', async () => {
    // Client sent "6.6.6.6"; the proxy appended the real peer address.
    assert.equal(await ipSeen('1', '6.6.6.6, 203.0.113.9'), '203.0.113.9');
  });

  it('address list: skips trusted proxies and stops at the first untrusted hop', async () => {
    assert.equal(await ipSeen('loopback, 10.0.0.0/8', '6.6.6.6, 198.51.100.7, 10.0.0.5'), '198.51.100.7');
  });
});

describe('configuration validation', () => {
  it('accepts only exact origins', () => {
    assert.equal(originProblem('https://erp.example.com'), null);
    assert.equal(originProblem('http://localhost:5173'), null);
    for (const bad of ['*', 'null', 'https://erp.example.com/', 'https://erp.example.com/app', 'ftp://x.example', 'https://ERP.example.com', 'https://erp.example.com:443']) {
      assert.ok(originProblem(bad), bad);
    }
  });

  it('accepts only real proxy addresses', () => {
    for (const good of ['loopback', 'uniquelocal', '10.0.0.1', '10.0.0.0/8', '::1', 'fd00::/8']) assert.ok(isProxyAddress(good), good);
    for (const bad of ['loopbak', '10.0.0.0/33', '999.1.1.1', '10.0.0.0/8/1', 'example.com']) assert.ok(!isProxyAddress(bad), bad);
  });

  // Boots config/env.js in a child process, from a directory without a .env file.
  const envModule = pathToFileURL(new URL('../src/config/env.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')).href;
  async function bootEnv(overrides) {
    const childEnv = { ...process.env, NODE_ENV: 'production', TRUST_PROXY: '1', CLIENT_URL: SECOND_ALLOWED, ...overrides };
    for (const [key, value] of Object.entries(childEnv)) if (value === undefined) delete childEnv[key];
    const script = `const { env } = await import(${JSON.stringify(envModule)}); console.log(JSON.stringify({ trustProxy: env.trustProxy, origins: env.clientOrigins }));`;
    try {
      const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], { cwd: os.tmpdir(), env: childEnv });
      return { code: 0, output: stdout };
    } catch (error) {
      return { code: error.code, output: `${error.stdout}${error.stderr}` };
    }
  }

  it('production starts with an explicit proxy setting and https origin', async () => {
    const result = await bootEnv({});
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(JSON.parse(result.output), { trustProxy: 1, origins: [SECOND_ALLOWED] });
  });

  const REFUSED = [
    ['TRUST_PROXY unset in production', { TRUST_PROXY: undefined }, /TRUST_PROXY/],
    ['TRUST_PROXY=true', { TRUST_PROXY: 'true' }, /TRUST_PROXY/],
    ['a misspelt proxy preset', { TRUST_PROXY: 'loopbak' }, /TRUST_PROXY/],
    ['an invalid CIDR', { TRUST_PROXY: '10.0.0.0/33' }, /TRUST_PROXY/],
    ['a wildcard origin', { CLIENT_URL: '*' }, /CLIENT_URL/],
    ['the null origin', { CLIENT_URL: 'null' }, /CLIENT_URL/],
    ['an origin with a trailing slash', { CLIENT_URL: 'https://erp.example.com/' }, /CLIENT_URL/],
    ['an http origin in production', { CLIENT_URL: 'http://erp.example.com' }, /https/],
  ];

  for (const [label, overrides, expected] of REFUSED) {
    it(`refuses to start with ${label}`, async () => {
      const result = await bootEnv(overrides);
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, expected);
    });
  }
});
