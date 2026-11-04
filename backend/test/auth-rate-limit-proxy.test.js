import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parseTrustProxy } from '../src/config/env.js';
import { AUTH_RATE_LIMITS } from '../src/middleware/authRateLimit.js';
import { installMocks, startApp } from './helpers/authApp.js';

describe('TRUST_PROXY parsing', () => {
  it('defaults to one hop in production and none elsewhere', () => {
    assert.equal(parseTrustProxy(undefined, true), 1);
    assert.equal(parseTrustProxy(undefined, false), false);
  });

  it('accepts false, hop counts and address lists', () => {
    assert.equal(parseTrustProxy('false', true), false);
    assert.equal(parseTrustProxy('2', false), 2);
    assert.deepEqual(parseTrustProxy('loopback, 10.0.0.0/8', false), ['loopback', '10.0.0.0/8']);
  });
});

describe('no trusted proxy (TRUST_PROXY unset outside production)', () => {
  let app;

  before(async () => {
    installMocks();
    app = await startApp();
  });

  after(() => app.stop());

  it('ignores a spoofed X-Forwarded-For, so rotating it cannot bypass the limit', async () => {
    const { limit } = AUTH_RATE_LIMITS.loginPerIp;
    for (let i = 0; i < limit; i += 1) {
      const res = await app.send('POST', '/auth/login', {
        ip: `203.0.113.${i + 1}`,
        body: { email: `spoof${i}@example.test`, password: 'wrong' },
      });
      assert.equal(res.status, 401, `attempt ${i + 1}`);
    }
    const res = await app.send('POST', '/auth/login', {
      ip: '198.51.100.250',
      body: { email: 'spoof-final@example.test', password: 'wrong' },
    });
    assert.equal(res.status, 429);
  });
});
