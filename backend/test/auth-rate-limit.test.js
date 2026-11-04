import './setup-auth-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { AUTH_RATE_LIMITS } from '../src/middleware/authRateLimit.js';
import { RATE_LIMIT_MESSAGE } from '../src/middleware/common.js';
import { addUser, installMocks, PASSWORD, startApp, tokenFor } from './helpers/authApp.js';

let app;

before(async () => {
  installMocks();
  app = await startApp();
});

after(() => app.stop());

const login = (ip, email, password = PASSWORD) => app.send('POST', '/auth/login', { ip, body: { email, password } });
const forgot = (ip, email) => app.send('POST', '/auth/forgot-password', { ip, body: { email } });
const reset = (ip) => app.send('POST', '/auth/reset-password', { ip, body: { token: 'a'.repeat(64), password: 'NewPassword-123' } });

function assertRateLimited(res, windowMs) {
  assert.equal(res.status, 429);
  assert.deepEqual(res.body, { success: false, error: { code: 'TOO_MANY_REQUESTS', message: RATE_LIMIT_MESSAGE } });
  const retryAfter = Number(res.headers.get('retry-after'));
  assert.ok(Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= windowMs / 1000, `Retry-After ${retryAfter}`);
}

describe('login: per-IP limit', () => {
  const { limit, windowMs } = AUTH_RATE_LIMITS.loginPerIp;

  it('successful sign-ins are not counted, so normal use never trips the limit', async () => {
    await addUser('busy@example.test');
    for (let i = 0; i < limit + 5; i += 1) {
      const res = await login('198.51.100.1', 'busy@example.test');
      assert.equal(res.status, 200, `sign-in ${i + 1}`);
    }
  });

  it('answers 429 with Retry-After once failed attempts exceed the limit', async () => {
    // Distinct emails so only the per-IP limit can trip.
    for (let i = 0; i < limit; i += 1) {
      assert.equal((await login('198.51.100.2', `nobody${i}@example.test`, 'wrong')).status, 401, `attempt ${i + 1}`);
    }
    assertRateLimited(await login('198.51.100.2', 'nobody-extra@example.test', 'wrong'), windowMs);
  });

  it('blocks even correct credentials from the limited IP', async () => {
    await addUser('blocked-ip@example.test');
    assertRateLimited(await login('198.51.100.2', 'blocked-ip@example.test'), windowMs);
  });

  it('keeps independent client IPs independent', async () => {
    assert.equal((await login('198.51.100.3', 'nobody0@example.test', 'wrong')).status, 401);
    assert.equal((await login('198.51.100.3', 'blocked-ip@example.test')).status, 200);
  });

  it('does not affect authenticated API requests from the limited IP', async () => {
    const user = await addUser('signed-in@example.test');
    const token = tokenFor(user);
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await app.send('GET', '/auth/me', { ip: '198.51.100.2', token })).status, 200);
    }
    assert.equal((await app.send('POST', '/auth/logout', { ip: '198.51.100.2' })).status, 200);
  });
});

describe('login: per-email limit and account enumeration', () => {
  const { limit, windowMs } = AUTH_RATE_LIMITS.loginPerEmail;

  // Every attempt from a fresh IP, so only the per-email limit applies.
  async function failedAttempts(email, prefix) {
    const results = [];
    for (let i = 0; i <= limit; i += 1) {
      const res = await login(`${prefix}.${i + 1}`, email, 'wrong-password');
      results.push({ status: res.status, body: res.body });
    }
    return results;
  }

  it('stops password guessing against one account spread over many IPs', async () => {
    await addUser('target@example.test');
    const results = await failedAttempts('target@example.test', '203.0.113');
    assert.deepEqual(results.slice(0, limit).map((r) => r.status), Array(limit).fill(401));
    assert.equal(results[limit].status, 429);
    assertRateLimited(await login('203.0.113.200', 'target@example.test'), windowMs);
  });

  it('applies identically to registered and unknown emails', async () => {
    await addUser('real@example.test');
    const known = await failedAttempts('real@example.test', '192.0.2');
    const unknown = await failedAttempts('ghost@example.test', '192.0.3');
    assert.deepEqual(known, unknown);
    assert.equal(known[0].body.error.message, 'Email or password is incorrect');
  });

  it('treats email case and whitespace as the same account', async () => {
    for (let i = 0; i < limit; i += 1) {
      await login(`10.10.0.${i + 1}`, i % 2 ? 'Case@Example.test' : ' case@example.test ', 'wrong');
    }
    assert.equal((await login('10.10.0.99', 'CASE@EXAMPLE.TEST', 'wrong')).status, 429);
  });

  it('a locked account answers exactly like a wrong password, even with the right password', async () => {
    await addUser('locked@example.test', { lockUntil: new Date(Date.now() + 10 * 60 * 1000) });
    const locked = await login('172.16.0.1', 'locked@example.test');
    const unknown = await login('172.16.0.2', 'unknown@example.test');
    assert.equal(locked.status, 401);
    assert.deepEqual(locked.body, unknown.body);
  });

  it('existing lockout still works: 5 wrong passwords lock the account', async () => {
    const user = await addUser('lockme@example.test');
    for (let i = 0; i < 5; i += 1) await login(`172.17.0.${i + 1}`, 'lockme@example.test', 'wrong');
    assert.equal(user.isLocked, true);
  });
});

describe('forgot-password', () => {
  it('returns the same response for registered and unknown emails', async () => {
    await addUser('forgot-real@example.test');
    const known = await forgot('100.64.0.1', 'forgot-real@example.test');
    const unknown = await forgot('100.64.0.2', 'forgot-ghost@example.test');
    assert.equal(known.status, 200);
    assert.deepEqual(known.body, unknown.body);
  });

  it('limits requests for one email across IPs', async () => {
    const { limit, windowMs } = AUTH_RATE_LIMITS.forgotPasswordPerEmail;
    for (let i = 0; i < limit; i += 1) assert.equal((await forgot(`100.64.1.${i + 1}`, 'spam@example.test')).status, 200);
    assertRateLimited(await forgot('100.64.1.99', 'spam@example.test'), windowMs);
  });

  it('limits requests from one IP, with a stricter limit than login', async () => {
    const { limit, windowMs } = AUTH_RATE_LIMITS.forgotPasswordPerIp;
    assert.ok(limit < AUTH_RATE_LIMITS.loginPerIp.limit && windowMs >= AUTH_RATE_LIMITS.loginPerIp.windowMs);
    for (let i = 0; i < limit; i += 1) assert.equal((await forgot('100.64.2.1', `user${i}@example.test`)).status, 200);
    assertRateLimited(await forgot('100.64.2.1', 'another@example.test'), windowMs);
    assert.equal((await forgot('100.64.2.2', 'another@example.test')).status, 200, 'other IPs unaffected');
  });
});

describe('reset-password', () => {
  it('limits token attempts per IP and leaves other IPs alone', async () => {
    const { limit, windowMs } = AUTH_RATE_LIMITS.resetPasswordPerIp;
    for (let i = 0; i < limit; i += 1) assert.equal((await reset('100.65.0.1')).status, 400, `attempt ${i + 1}`);
    assertRateLimited(await reset('100.65.0.1'), windowMs);
    assert.equal((await reset('100.65.0.2')).status, 400);
  });
});

describe('change-password', () => {
  it('limits wrong current-password guesses per signed-in user', async () => {
    const { limit, windowMs } = AUTH_RATE_LIMITS.changePasswordPerUser;
    const user = await addUser('changer@example.test');
    const other = await addUser('other-changer@example.test');
    const body = { currentPassword: 'not-it', newPassword: 'BrandNew-Pass-1' };
    for (let i = 0; i < limit; i += 1) {
      const res = await app.send('POST', '/auth/change-password', { ip: `100.66.0.${i + 1}`, token: tokenFor(user), body });
      assert.equal(res.status, 400, `attempt ${i + 1}`);
    }
    const limited = await app.send('POST', '/auth/change-password', { ip: '100.66.0.99', token: tokenFor(user), body });
    assertRateLimited(limited, windowMs);
    const unaffected = await app.send('POST', '/auth/change-password', { ip: '100.66.0.99', token: tokenFor(other), body });
    assert.equal(unaffected.status, 400);
  });

  it('a correct change still succeeds', async () => {
    const user = await addUser('happy-changer@example.test');
    const res = await app.send('POST', '/auth/change-password', {
      ip: '100.66.1.1',
      token: tokenFor(user),
      body: { currentPassword: PASSWORD, newPassword: 'BrandNew-Pass-1' },
    });
    assert.equal(res.status, 200);
  });
});
