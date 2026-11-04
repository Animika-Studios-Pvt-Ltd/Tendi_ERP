import { mock } from 'node:test';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { DEFAULT_ROLES, ROLES, toPermissionEntries } from '../../src/config/rbac.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { Role } from '../../src/models/Role.js';
import { User } from '../../src/models/User.js';
import { signAccessToken } from '../../src/utils/token.js';

export const PASSWORD = 'Correct-Horse-42';

const adminRole = () => {
  const base = DEFAULT_ROLES.find((role) => role.key === ROLES.COMPANY_ADMIN);
  return new Role({
    key: base.key,
    name: base.name,
    dataScope: base.dataScope,
    permissions: toPermissionEntries(base.permissions),
    isActive: true,
  });
};

/** In-memory users keyed by email; no MongoDB involved. */
export const usersByEmail = new Map();

export async function addUser(email, extra = {}) {
  const role = adminRole();
  const user = new User({ firstName: 'Test', email, password: 'placeholder-password', role: role._id, ...extra });
  user.role = role;
  user.populate = async () => user;
  // Low cost keeps tests fast; compare() works with any cost factor.
  user.password = await bcrypt.hash(PASSWORD, 4);
  usersByEmail.set(email, user);
  return user;
}

// Mongoose query stand-in: chainable select(), populate(), and awaitable.
const query = (result) => {
  const q = {
    select: () => q,
    populate: async () => result,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
};

export function installMocks() {
  mock.method(User, 'findOne', (filter) => query(filter?.email ? usersByEmail.get(filter.email) ?? null : null));
  mock.method(User, 'findById', (id) => query([...usersByEmail.values()].find((u) => String(u._id) === String(id)) ?? null));
  mock.method(User.prototype, 'save', async function save() {
    return this;
  });
  mock.method(AuditLog, 'create', async () => ({}));
}

export const tokenFor = (user) => signAccessToken(user);

export async function startApp() {
  mongoose.connection.readyState = 1;
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  const send = async (method, path, { ip, body, token } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (ip) headers['x-forwarded-for'] = ip;
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, headers: res.headers, body: await res.json() };
  };

  const stop = async () => {
    mongoose.connection.readyState = 0;
    await new Promise((resolve) => server.close(resolve));
  };

  return { send, stop };
}
