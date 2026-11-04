import './setup-env.js';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, it, mock } from 'node:test';
import express from 'express';
import { DatabaseConnectionError } from '../src/config/db.js';
import { isAppReady, setAppReady } from '../src/config/lifecycle.js';
import { createShutdown, registerProcessHandlers, startServer } from '../src/startup.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listenOn(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

beforeEach(() => setAppReady(false));

describe('startServer', () => {
  it('never creates the app or opens a port when MongoDB retries are exhausted', async () => {
    const createApp = mock.fn(() => express());
    const connect = mock.fn(async () => {
      throw new DatabaseConnectionError(5, new Error('querySrv ENOTFOUND'));
    });

    await assert.rejects(startServer({ createApp, connect, port: 0 }), DatabaseConnectionError);
    assert.equal(connect.mock.callCount(), 1);
    assert.equal(createApp.mock.callCount(), 0);
    assert.equal(isAppReady(), false);
  });

  it('connects, then creates the app, then listens, then marks ready', async () => {
    const order = [];
    const server = await startServer({
      connect: async () => {
        order.push('connect');
        return {};
      },
      createApp: () => {
        order.push('createApp');
        return express();
      },
      port: 0,
    });
    try {
      assert.deepEqual(order, ['connect', 'createApp']);
      assert.equal(server.listening, true);
      assert.equal(isAppReady(), true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('does not listen when the connection was abandoned for shutdown', async () => {
    const createApp = mock.fn(() => express());
    assert.equal(await startServer({ createApp, connect: async () => null, port: 0 }), null);
    assert.equal(createApp.mock.callCount(), 0);
  });
});

describe('createShutdown', () => {
  it('lets an active request finish, closes the server, then MongoDB, then exits 0', async () => {
    const order = [];
    const app = express();
    app.get('/slow', async (_req, res) => {
      await delay(150);
      order.push('request-finished');
      res.send('done');
    });
    const { server, url } = await listenOn(app);
    server.on('close', () => order.push('server-closed'));
    setAppReady(true);

    const shutdown = createShutdown({
      getServer: () => server,
      disconnect: async () => order.push('db-closed'),
      exit: (code) => order.push(`exit:${code}`),
      timeoutMs: 2000,
    });

    const response = fetch(`${url}/slow`, { headers: { connection: 'close' } });
    await delay(30);
    const done = shutdown('SIGTERM', 0);
    assert.equal(isAppReady(), false, 'readiness drops as soon as shutdown starts');

    assert.equal(await (await response).text(), 'done');
    await done;
    assert.deepEqual(order, ['request-finished', 'server-closed', 'db-closed', 'exit:0']);
  });

  it('runs once for repeated signals', async () => {
    const disconnect = mock.fn(async () => {});
    const exit = mock.fn();
    const shutdown = createShutdown({ getServer: () => null, disconnect, exit });

    await Promise.all([shutdown('SIGINT', 0), shutdown('SIGTERM', 0), shutdown('SIGINT', 0)]);
    assert.equal(disconnect.mock.callCount(), 1);
    assert.equal(exit.mock.callCount(), 1);
    assert.deepEqual(exit.mock.calls[0].arguments, [0]);
  });

  it('raises the exit code to 1 if a crash happens while a signal shutdown is draining', async () => {
    let release;
    const exit = mock.fn();
    const shutdown = createShutdown({
      getServer: () => null,
      disconnect: () => new Promise((resolve) => (release = resolve)),
      exit,
    });

    const first = shutdown('SIGTERM', 0);
    shutdown('uncaughtException', 1);
    await delay(10);
    release();
    await first;
    assert.deepEqual(exit.mock.calls.map((c) => c.arguments), [[1]]);
  });

  it('handles server.close errors and still closes MongoDB, exiting 1', async () => {
    const disconnect = mock.fn(async () => {});
    const exit = mock.fn();
    const fakeServer = {
      listening: true,
      close: (cb) => cb(Object.assign(new Error('close failed'), { code: 'EFAKE' })),
      closeIdleConnections: () => {},
    };
    const shutdown = createShutdown({ getServer: () => fakeServer, disconnect, exit });

    await shutdown('SIGTERM', 0);
    assert.equal(disconnect.mock.callCount(), 1);
    assert.deepEqual(exit.mock.calls[0].arguments, [1]);
  });

  it('treats ERR_SERVER_NOT_RUNNING as already closed', async () => {
    const exit = mock.fn();
    const fakeServer = {
      listening: true,
      close: (cb) => cb(Object.assign(new Error('not running'), { code: 'ERR_SERVER_NOT_RUNNING' })),
    };
    const shutdown = createShutdown({ getServer: () => fakeServer, disconnect: async () => {}, exit });
    await shutdown('SIGINT', 0);
    assert.deepEqual(exit.mock.calls[0].arguments, [0]);
  });

  it('exits 1 if closing MongoDB fails', async () => {
    const exit = mock.fn();
    const shutdown = createShutdown({
      getServer: () => null,
      disconnect: async () => {
        throw new Error('close failed');
      },
      exit,
    });
    await shutdown('SIGTERM', 0);
    assert.deepEqual(exit.mock.calls[0].arguments, [1]);
  });

  it('forces exit 1 and destroys open sockets when a request outlives the timeout', async () => {
    const app = express();
    app.get('/hang', () => {});
    const { server, url } = await listenOn(app);
    const exit = mock.fn();
    const shutdown = createShutdown({ getServer: () => server, disconnect: async () => {}, exit, timeoutMs: 100 });

    const response = fetch(`${url}/hang`).catch((error) => error);
    await delay(30);
    shutdown('SIGTERM', 0);
    await delay(200);

    assert.deepEqual(exit.mock.calls[0].arguments, [1]);
    assert.ok((await response) instanceof Error, 'hung request socket was destroyed');
    assert.equal(exit.mock.callCount(), 1, 'exit is called once even if draining completes later');
  });
});

describe('registerProcessHandlers', () => {
  it('maps signals to exit 0 and crashes to exit 1', () => {
    const proc = new EventEmitter();
    const shutdown = mock.fn();
    registerProcessHandlers(shutdown, { proc });

    proc.emit('SIGINT');
    proc.emit('SIGTERM');
    proc.emit('unhandledRejection', new Error('boom'));
    proc.emit('uncaughtException', new Error('bang'));

    assert.deepEqual(
      shutdown.mock.calls.map((call) => call.arguments),
      [['SIGINT', 0], ['SIGTERM', 0], ['unhandledRejection', 1], ['uncaughtException', 1]],
    );
  });

  it('redacts connection strings in crash logs', (t) => {
    const errors = [];
    t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
    const proc = new EventEmitter();
    registerProcessHandlers(() => {}, { proc, includeStack: true });

    proc.emit('unhandledRejection', new Error('bad uri mongodb+srv://admin:hunter2@cluster0.example.net'));
    assert.ok(errors.length > 0);
    assert.ok(errors.every((line) => !line.includes('hunter2')));
  });
});
