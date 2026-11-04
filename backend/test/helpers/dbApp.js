import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { DEFAULT_ROLES, toPermissionEntries } from '../../src/config/rbac.js';
import { Role } from '../../src/models/Role.js';
import { User, USER_STATUS } from '../../src/models/User.js';
import { signAccessToken } from '../../src/utils/token.js';

/**
 * Real MongoDB (in-memory, per test file) with the default roles seeded.
 * Nothing touches the development or production database.
 */
export async function startDbApp() {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'tendi_test' });
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));

  const roles = {};
  for (const role of DEFAULT_ROLES) {
    roles[role.key] = await Role.create({ ...role, permissions: toPermissionEntries(role.permissions), isSystem: true });
  }

  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  async function createUser(name, roleKey, extra = {}) {
    const user = await User.create({
      firstName: name,
      lastName: 'Tester',
      email: `${name.toLowerCase()}@example.test`,
      password: 'Placeholder-Pass-1',
      role: roles[roleKey]._id,
      status: USER_STATUS.ACTIVE,
      ...extra,
    });
    await user.populate('role');
    return { user, token: signAccessToken(user), id: String(user._id) };
  }

  async function send(method, path, { as, body } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (as) headers.authorization = `Bearer ${as.token}`;
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, text };
  }

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  }

  return { roles, createUser, send, stop };
}
