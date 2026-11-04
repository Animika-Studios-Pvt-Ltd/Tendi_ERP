import './setup-upload-concurrency-env.js';
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { getActiveUploadCount } from '../src/middleware/upload.js';
import * as fx from './helpers/fixtures.js';
import {
  buildUploadApp,
  cloudinaryBehaviour,
  cloudinaryCalls,
  installMocks,
  resetCalls,
  tokenFor,
  users,
} from './helpers/uploadApp.js';

/*
 * Regression tests for the client-disconnect bug: closing the connection mid-batch
 * used to clear buffers that storage was still reading (storage received [77, 0]) and
 * free the concurrency slot while storage was still running.
 */

let server;
let port;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const auth = (user) => ({ authorization: `Bearer ${tokenFor(user)}` });
const PDF_BYTES = fx.pdf().length;

before(async () => {
  installMocks();
  server = buildUploadApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
});
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach(async () => {
  for (let i = 0; i < 100 && getActiveUploadCount() > 0; i += 1) await delay(20);
  resetCalls();
});

function pdfForm(count) {
  const body = new FormData();
  for (let i = 0; i < count; i += 1) body.append('files', new Blob([fx.pdf()], { type: fx.MIME.pdf }), `f${i}.pdf`);
  return body;
}

/** Sends a complete multipart upload, then drops the connection after `abortAfterMs`. */
function uploadThenDisconnect(user, { files = 2, abortAfterMs }) {
  const controller = new AbortController();
  const done = fetch(`http://127.0.0.1:${port}/documents`, {
    method: 'POST',
    headers: auth(user),
    body: pdfForm(files),
    signal: controller.signal,
  }).catch(() => null);
  setTimeout(() => controller.abort(), abortAfterMs);
  return done;
}

async function upload(user, files = 1) {
  const res = await fetch(`http://127.0.0.1:${port}/documents`, { method: 'POST', headers: auth(user), body: pdfForm(files) });
  return { status: res.status, body: await res.json() };
}

async function waitForIdle(timeoutMs = 4000) {
  const started = Date.now();
  while (getActiveUploadCount() > 0 && Date.now() - started < timeoutMs) await delay(20);
  return getActiveUploadCount();
}

/** Opens an upload whose body never finishes, so it holds a slot until destroyed. */
function holdOpen(user) {
  const req = http.request({
    port,
    method: 'POST',
    path: '/documents',
    headers: { ...auth(user), 'content-type': 'multipart/form-data; boundary=x', 'content-length': '4096' },
  });
  const response = new Promise((resolve) => {
    req.on('response', (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.on('error', () => resolve(null));
  });
  req.write('--x\r\nContent-Disposition: form-data; name="files"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-');
  return { req, response };
}

describe('client disconnect during a two-file upload', () => {
  it('never hands storage an emptied buffer, keeps the slot, skips remaining files and rolls back', async () => {
    cloudinaryBehaviour.delayMs = 300;
    await uploadThenDisconnect(users.admin, { files: 2, abortAfterMs: 100 });

    // First file is in storage; the client is gone.
    await delay(100);
    assert.equal(cloudinaryCalls.uploads.length, 1, 'first file reached storage');
    assert.equal(getActiveUploadCount(), 1, 'slot stays occupied while storage is running');

    assert.equal(await waitForIdle(), 0, 'slot released once storage and rollback settled');

    const bytes = cloudinaryCalls.uploads.map((call) => call.bytes);
    assert.ok(bytes.every((n) => n === PDF_BYTES), `storage received ${JSON.stringify(bytes)}, never an emptied buffer`);
    assert.equal(cloudinaryCalls.uploads.length, 1, 'remaining file is not uploaded after the abort');
    assert.equal(cloudinaryCalls.uploads[0].activeUploadsAtCompletion, 1, 'slot held until the in-flight upload finished');

    const storedKey = `${cloudinaryCalls.uploads[0].options.folder}/${cloudinaryCalls.uploads[0].options.public_id}`;
    assert.deepEqual(
      cloudinaryCalls.destroys.map((call) => call.key),
      [storedKey],
      'the partially stored batch is rolled back',
    );
  });

  it('rolls back a fully stored batch when the client left before the response', async () => {
    cloudinaryBehaviour.delayMs = 150;
    await uploadThenDisconnect(users.admin, { files: 1, abortAfterMs: 50 });
    assert.equal(await waitForIdle(), 0);
    assert.equal(cloudinaryCalls.uploads.length, 1);
    assert.equal(cloudinaryCalls.uploads[0].bytes, PDF_BYTES);
    assert.equal(cloudinaryCalls.destroys.length, 1, 'no orphaned file for an aborted request');
  });
});

describe('slot release', () => {
  it('releases after success', async () => {
    assert.equal((await upload(users.admin, 2)).status, 201);
    assert.equal(await waitForIdle(), 0);
    assert.ok(cloudinaryCalls.uploads.every((call) => call.activeUploadsDuring === 1));
  });

  it('releases after a validation failure', async () => {
    const body = new FormData();
    body.append('files', new Blob([fx.png()], { type: fx.MIME.pdf }), 'fake.pdf');
    const res = await fetch(`http://127.0.0.1:${port}/documents`, { method: 'POST', headers: auth(users.admin), body });
    assert.equal(res.status, 415);
    assert.equal(await waitForIdle(), 0);
  });

  it('releases after a storage failure and rollback', async () => {
    cloudinaryBehaviour.failOnUploadNumber = 2;
    const { status, body } = await upload(users.admin, 2);
    assert.equal(status, 502);
    assert.equal(body.error.code, 'UPLOAD_FAILED');
    assert.equal(cloudinaryCalls.destroys.length, 1);
    assert.equal(await waitForIdle(), 0);
  });
});

describe('per-user concurrency', () => {
  it('limits one user without blocking other users', async () => {
    const held = [holdOpen(users.pmA), holdOpen(users.pmA)];
    for (let i = 0; i < 50 && getActiveUploadCount() < 2; i += 1) await delay(20);
    assert.equal(getActiveUploadCount(), 2);

    const third = await upload(users.pmA);
    assert.equal(third.status, 429, JSON.stringify(third.body));
    assert.equal(third.body.error.code, 'UPLOAD_USER_LIMIT');

    const other = await upload(users.admin);
    assert.equal(other.status, 201, 'a different user still has capacity');

    for (const { req } of held) req.destroy();
    assert.equal(await waitForIdle(), 0);
  });

  it('cannot be bypassed by disconnecting and reconnecting while storage runs', async () => {
    cloudinaryBehaviour.delayMs = 600;
    await uploadThenDisconnect(users.pmA, { files: 1, abortAfterMs: 80 });
    await uploadThenDisconnect(users.pmA, { files: 1, abortAfterMs: 80 });
    await delay(100);

    const third = await upload(users.pmA);
    assert.equal(third.status, 429, 'both slots still belong to the abandoned uploads');
    assert.equal(await waitForIdle(), 0);
  });
});

describe('request body timeout', () => {
  it('answers 408, frees the slot and stores nothing when the body stalls', async () => {
    const { response } = holdOpen(users.admin);
    const started = Date.now();
    const result = await Promise.race([response, delay(4000).then(() => 'no response')]);
    assert.notEqual(result, 'no response', 'stalled upload must be cut off');
    assert.equal(result.status, 408);
    assert.equal(result.body.error.code, 'UPLOAD_TIMEOUT');
    assert.ok(Date.now() - started < 3000);
    assert.equal(await waitForIdle(), 0);
    assert.equal(cloudinaryCalls.uploads.length, 0);
  });
});

describe('idempotent cleanup', () => {
  it('release and buffer cleanup can run repeatedly without corrupting counters', async () => {
    const { createUploadContext } = await import('../src/services/upload/uploadContext.js');
    const { releaseUploadBuffers } = await import('../src/middleware/upload.js');

    let releases = 0;
    const ctx = createUploadContext({ onRelease: () => (releases += 1) });
    let finish;
    ctx.track(new Promise((resolve) => (finish = resolve)));
    ctx.responseClosed();
    ctx.responseClosed();
    assert.equal(releases, 0, 'not released while an operation is pending');
    finish();
    await delay(0);
    ctx.responseClosed();
    ctx.release();
    ctx.release();
    assert.equal(releases, 1);

    const req = { files: [{ buffer: Buffer.from('x') }] };
    releaseUploadBuffers(req);
    releaseUploadBuffers(req);
    assert.equal(req.files, undefined);

    assert.equal((await upload(users.admin)).status, 201);
    assert.equal(await waitForIdle(), 0);
    assert.ok(getActiveUploadCount() >= 0);
  });
});
