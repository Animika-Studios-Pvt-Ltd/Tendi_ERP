import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import express from 'express';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requestId, requestLogger } from '../src/middleware/requestLogging.js';
import { createUpload } from '../src/middleware/upload.js';
import { User } from '../src/models/User.js';
import { logger, redactSensitive, sanitizeUrl } from '../src/utils/logger.js';
import { addUser, installMocks, startApp } from './helpers/authApp.js';

const MONGO_PASSWORD = 'MongoPw-7Xq2';
const MONGO_URI = `mongodb+srv://tendi_admin:${MONGO_PASSWORD}@cluster0.example.mongodb.net/erp`;
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLXZhbHVl';
const RESET_TOKEN = 'ab'.repeat(32);
const EMAIL_LOCAL = 'ravi.kumar';
const EMAIL = `${EMAIL_LOCAL}@tendi.example`;
const USER_PASSWORD = 'User-Secret-Pass-9';

/** Captures everything written through console while `fn` runs. */
const lines = [];
const captured = () => lines.join('\n');
before(() => {
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    mock.method(console, method, (...args) => lines.push(args.map(String).join(' ')));
  }
});
beforeEach(() => {
  lines.length = 0;
});
after(() => mock.restoreAll());

function assertNoSecrets(text, extra = []) {
  for (const secret of [MONGO_PASSWORD, JWT, RESET_TOKEN, EMAIL_LOCAL, USER_PASSWORD, process.env.JWT_SECRET, ...extra]) {
    assert.ok(!text.includes(secret), `log leaked "${secret}":\n${text}`);
  }
}

describe('logger redaction', () => {
  it('redacts credentials, tokens, secrets and emails in strings', () => {
    logger.error(`connect failed: ${MONGO_URI}`);
    logger.warn('cloudinary://123456789012345:Abc-Cloud-Secret@demo');
    logger.info(`Authorization: Bearer ${JWT}`);
    logger.info(`Cookie: lumos_session=${JWT}; theme=dark`);
    logger.info(`reset token ${RESET_TOKEN} for ${EMAIL}`);
    logger.info(`signing with ${process.env.JWT_SECRET}`);
    logger.error("Invalid Signature 9f8e7d. String to sign - 'public_id=abc&timestamp=1' api_key=123456789012345");
    const text = captured();
    assertNoSecrets(text, ['Abc-Cloud-Secret', '123456789012345', 'public_id=abc']);
    assert.match(text, /r\*\*\*@tendi\.example/, 'email keeps first letter and domain');
    assert.match(text, /cluster0\.example\.mongodb\.net/, 'host stays visible for diagnosis');
  });

  it('redacts sensitive keys in objects and never dumps error internals', () => {
    const error = new Error(`E11000 duplicate key { email: "${EMAIL}" }`);
    error.code = 11000;
    error.config = { headers: { authorization: `Bearer ${JWT}`, cookie: `lumos_session=${JWT}` } };
    const circular = { password: USER_PASSWORD, token: RESET_TOKEN, nested: { apiSecret: 'Nested-Secret-1' } };
    circular.self = circular;

    logger.error('provider failed', error);
    logger.info('payload', circular);
    const text = captured();
    assertNoSecrets(text, ['Nested-Secret-1']);
    assert.match(text, /Error \[11000\]: E11000/, 'error class and code are kept');
    assert.match(text, /\[Circular\]/);
  });

  it('sanitizeUrl keeps the path and harmless paging params but redacts other query values', () => {
    const url = sanitizeUrl(`/api/v1/auth/reset?token=${RESET_TOKEN}&email=${EMAIL}&page=2#frag`);
    assert.equal(url, '/api/v1/auth/reset?token=[REDACTED]&email=[REDACTED]&page=2');
    assert.equal(redactSensitive('plain text'), 'plain text');
  });
});

describe('request logging', () => {
  async function hit(production) {
    const written = [];
    const app = express();
    app.use(requestId);
    app.use(requestLogger({ production, write: (line) => written.push(line) }));
    app.post('/api/v1/auth/login', (_req, res) => res.status(401).json({}));
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/login?token=${RESET_TOKEN}&email=${EMAIL}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${JWT}`,
          cookie: `lumos_session=${JWT}`,
          referer: `http://localhost:5173/reset-password?token=${RESET_TOKEN}`,
          'x-request-id': 'req-abc-123',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: EMAIL, password: USER_PASSWORD }),
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    return written.join('\n');
  }

  for (const production of [false, true]) {
    it(`${production ? 'production' : 'development'} format logs route, status and request id only`, async () => {
      const line = await hit(production);
      assertNoSecrets(line);
      assert.match(line, /POST \/api\/v1\/auth\/login\?token=\[REDACTED\]&email=\[REDACTED\]/);
      assert.match(line, / 401 /);
      assert.match(line, /req-abc-123/);
    });
  }

  it('replaces malformed upstream request ids', async () => {
    const app = express();
    app.use(requestId);
    app.get('/', (req, res) => res.json({ id: req.id }));
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/`, { headers: { 'x-request-id': `bad id <script> ${'x'.repeat(80)}` } });
      assert.match(res.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('application error and auth logging', () => {
  let app;

  before(async () => {
    installMocks();
    app = await startApp();
  });

  after(() => app.stop());

  it('an unexpected error on login logs route, status, request id and error class, not the body or credentials', async (t) => {
    t.mock.method(User, 'findOne', () => {
      throw Object.assign(new Error(`query failed via ${MONGO_URI} for ${EMAIL}`), { name: 'MongoParseError' });
    });
    const res = await app.send('POST', `/auth/login?token=${RESET_TOKEN}`, {
      body: { email: EMAIL, password: USER_PASSWORD },
      token: JWT,
    });
    assert.equal(res.status, 500);
    const requestIdHeader = res.headers.get('x-request-id');
    const text = captured();
    assertNoSecrets(text);
    assert.match(text, /POST \/api\/v1\/auth\/login\?token=\[REDACTED\] 500/);
    assert.ok(text.includes(requestIdHeader), 'request id correlates the log line');
    assert.match(text, /MongoParseError/);
  });

  it('forgot-password never logs the reset link, token or email', async () => {
    await addUser(EMAIL);
    const res = await app.send('POST', '/auth/forgot-password', { body: { email: EMAIL } });
    assert.equal(res.status, 200);
    const text = captured();
    assertNoSecrets(text);
    assert.ok(!/reset-password\?token=/.test(text));
  });
});

describe('upload rejection logging', () => {
  it('logs the rejection code without the uploaded file name or contents', async () => {
    const app = express();
    app.post('/upload', ...createUpload().single('file'), (_req, res) => res.json({}));
    app.use(errorHandler);
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const form = new FormData();
      form.append('file', new Blob(['MZ-secret-payload-contents'], { type: 'application/pdf' }), 'Salary-Ravi-Kumar.pdf');
      const res = await fetch(`http://127.0.0.1:${server.address().port}/upload`, { method: 'POST', body: form });
      assert.equal(res.status, 415);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    const text = captured();
    assert.match(text, /upload\.rejected/);
    for (const leak of ['Salary-Ravi-Kumar', 'secret-payload']) assert.ok(!text.includes(leak), `log leaked ${leak}`);
  });
});
