import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'Pr0cessTestSecret';

function freePort() {
  return new Promise((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

describe('node src/server.js with an unreachable database', () => {
  it('retries, never opens the HTTP port, logs safely and exits 1', async () => {
    const port = await freePort();
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: backendDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        TRUST_PROXY: 'false',
        CLIENT_URL: 'https://erp.example.com',
        PORT: String(port),
        MONGODB_URI: `mongodb://produser:${SECRET}@127.0.0.1:1/tendi_erp_test`,
        JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters-long',
        MONGODB_CONNECT_MAX_ATTEMPTS: '3',
        MONGODB_CONNECT_RETRY_BASE_MS: '50',
        MONGODB_SERVER_SELECTION_TIMEOUT_MS: '300',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));

    let exited = false;
    let portEverOpen = false;
    const exitCode = new Promise((resolve) =>
      child.on('exit', (code) => {
        exited = true;
        resolve(code);
      }),
    );
    while (!exited) {
      if (await portIsOpen(port)) portEverOpen = true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.equal(await exitCode, 1);
    assert.equal(portEverOpen, false, 'HTTP port must never accept connections');
    assert.match(output, /attempt 3\/3 failed/);
    assert.match(output, /HTTP port was not opened/);
    assert.doesNotMatch(output, /listening on/);
    assert.ok(!output.includes(SECRET), 'logs must not contain the database password');
  });
});
