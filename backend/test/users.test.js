import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { DEFAULT_ROLES, ROLES, toPermissionEntries } from '../src/config/rbac.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Role } from '../src/models/Role.js';
import { User, USER_STATUS } from '../src/models/User.js';
import { signAccessToken } from '../src/utils/token.js';

let server;
let baseUrl;
const rolesMap = new Map();
const usersMap = new Map();

function createMockRole(key, name, dataScope, permissions) {
  const role = new Role({
    _id: new mongoose.Types.ObjectId(),
    key,
    name,
    dataScope,
    permissions: toPermissionEntries(permissions),
    isSystem: true,
    isActive: true,
  });
  rolesMap.set(key, role);
  rolesMap.set(String(role._id), role);
  return role;
}

function createMockUser(firstName, email, roleKey, status = USER_STATUS.ACTIVE) {
  const role = rolesMap.get(roleKey);
  const user = new User({
    _id: new mongoose.Types.ObjectId(),
    firstName,
    lastName: 'Tester',
    email: email.toLowerCase(),
    password: 'MockHashedPassword',
    role: role._id,
    status,
    phone: '+91 98765 43210',
    designation: role.name,
    assignedProjects: [],
  });
  user.role = role;
  user.populate = async () => user;
  usersMap.set(String(user._id), user);
  usersMap.set(user.email, user);
  return user;
}

const tokenFor = (user) => signAccessToken(user);

const send = async (method, path, { token, body } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

describe('User & Role Management API', () => {
  let superAdmin;
  let companyAdmin;
  let engineer;

  before(async () => {
    mongoose.connection.readyState = 1;

    // Initialize default roles
    for (const r of DEFAULT_ROLES) {
      createMockRole(r.key, r.name, r.dataScope, r.permissions);
    }

    // Mock Mongoose calls
    mock.method(Role, 'find', (filter = {}) => {
      let list = [...new Set(rolesMap.values())];
      if (filter.isActive !== undefined) list = list.filter((r) => r.isActive === filter.isActive);
      return {
        sort: () => ({
          lean: async () => list,
        }),
      };
    });

    mock.method(Role, 'findOne', (filter = {}) => {
      let found = null;
      if (filter._id) found = rolesMap.get(String(filter._id));
      if (filter.key) found = rolesMap.get(filter.key);
      return Promise.resolve(found ?? null);
    });

    mock.method(User, 'aggregate', async () => []);
    mock.method(AuditLog, 'create', async () => ({}));

    mock.method(User, 'find', (filter = {}) => {
      let list = [...new Set(usersMap.values())];
      if (filter.status) list = list.filter((u) => u.status === filter.status);
      if (filter.role) list = list.filter((u) => String(u.role?._id ?? u.role) === String(filter.role));
      if (filter.$or) {
        list = list.filter((u) =>
          filter.$or.some((cond) => {
            if (cond.firstName) return cond.firstName.test(u.firstName);
            if (cond.lastName) return cond.lastName.test(u.lastName);
            if (cond.email) return cond.email.test(u.email);
            return false;
          }),
        );
      }
      return {
        sort: () => ({
          skip: (skip) => ({
            limit: (limit) => ({
              populate: () => ({
                lean: async () => list.slice(skip, skip + limit),
              }),
            }),
          }),
        }),
      };
    });

    mock.method(User, 'countDocuments', async (filter = {}) => {
      let list = [...new Set(usersMap.values())];
      if (filter.status) list = list.filter((u) => u.status === filter.status);
      if (filter.role) list = list.filter((u) => String(u.role?._id ?? u.role) === String(filter.role));
      return list.length;
    });

    mock.method(User, 'findOne', (filter = {}) => {
      let found = null;
      if (filter.email) {
        found = [...usersMap.values()].find((u) => {
          const matchEmail = u.email === filter.email.toLowerCase();
          const matchId = filter._id?.$ne ? String(u._id) !== String(filter._id.$ne) : true;
          return matchEmail && matchId;
        });
      }
      return Promise.resolve(found ?? null);
    });

    mock.method(User, 'findById', (id) => {
      const found = usersMap.get(String(id));
      return {
        populate: async () => found ?? null,
      };
    });

    mock.method(User, 'create', async (data) => {
      const role = rolesMap.get(String(data.role)) ?? rolesMap.get(data.role);
      const user = new User({
        _id: new mongoose.Types.ObjectId(),
        ...data,
      });
      user.role = role;
      user.populate = async () => user;
      usersMap.set(String(user._id), user);
      usersMap.set(user.email, user);
      return user;
    });

    mock.method(User.prototype, 'save', async function save() {
      usersMap.set(String(this._id), this);
      usersMap.set(this.email, this);
      return this;
    });

    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

    superAdmin = createMockUser('Super', 'superadmin@tendi.com', ROLES.SUPER_ADMIN);
    companyAdmin = createMockUser('Admin', 'companyadmin@tendi.com', ROLES.COMPANY_ADMIN);
    engineer = createMockUser('Engineer', 'siteengineer@tendi.com', ROLES.SITE_ENGINEER);
  });

  after(async () => {
    mongoose.connection.readyState = 0;
    await new Promise((resolve) => server.close(resolve));
  });

  describe('Authorization and Access Control', () => {
    it('refuses unauthenticated requests with 401', async () => {
      const res = await send('GET', '/users');
      assert.equal(res.status, 401);
    });

    it('refuses access to users without users:read permission with 403', async () => {
      const res = await send('GET', '/users', { token: tokenFor(engineer) });
      assert.equal(res.status, 403);
    });

    it('allows Company Admin and Super Admin to list users', async () => {
      const resAdmin = await send('GET', '/users', { token: tokenFor(companyAdmin) });
      assert.equal(resAdmin.status, 200);
      assert.ok(Array.isArray(resAdmin.body.data));

      const resSuper = await send('GET', '/users', { token: tokenFor(superAdmin) });
      assert.equal(resSuper.status, 200);
      assert.ok(Array.isArray(resSuper.body.data));
    });
  });

  describe('User Listing & Filtering', () => {
    it('returns paginated users with metadata and excludes sensitive fields', async () => {
      const res = await send('GET', '/users?page=1&limit=10', { token: tokenFor(superAdmin) });
      assert.equal(res.status, 200);
      assert.ok(res.body.meta);
      assert.equal(res.body.meta.page, 1);
      assert.ok(res.body.data.length > 0);

      for (const item of res.body.data) {
        assert.equal(item.password, undefined);
        assert.equal(item.passwordResetTokenHash, undefined);
        assert.equal(item.failedLoginAttempts, undefined);
        assert.equal(item.lockUntil, undefined);
      }
    });

    it('filters users by status', async () => {
      const res = await send('GET', '/users?status=active', { token: tokenFor(superAdmin) });
      assert.equal(res.status, 200);
      for (const item of res.body.data) {
        assert.equal(item.status, 'active');
      }
    });
  });

  describe('User Creation', () => {
    it('rejects duplicate email with 409 Conflict', async () => {
      const res = await send('POST', '/users', {
        token: tokenFor(superAdmin),
        body: {
          firstName: 'Duplicate',
          email: superAdmin.email,
          password: 'Password123!',
          role: ROLES.SITE_ENGINEER,
        },
      });
      assert.equal(res.status, 409);
    });

    it('prevents Company Admin from creating a Super Admin (privilege escalation)', async () => {
      const res = await send('POST', '/users', {
        token: tokenFor(companyAdmin),
        body: {
          firstName: 'Rogue',
          email: 'rogue@tendi.com',
          password: 'Password123!',
          role: ROLES.SUPER_ADMIN,
        },
      });
      assert.equal(res.status, 403);
    });

    it('allows Super Admin to create a new user', async () => {
      const res = await send('POST', '/users', {
        token: tokenFor(superAdmin),
        body: {
          firstName: 'New',
          lastName: 'Member',
          email: 'newmember@tendi.com',
          password: 'ValidPassword123!',
          role: ROLES.PROJECT_MANAGER,
          phone: '+91 99999 88888',
        },
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.email, 'newmember@tendi.com');
      assert.equal(res.body.data.password, undefined);
    });
  });

  describe('User Updates & Protections', () => {
    it('prevents Company Admin from editing a Super Admin account', async () => {
      const res = await send('PATCH', `/users/${superAdmin._id}`, {
        token: tokenFor(companyAdmin),
        body: { firstName: 'Hacked' },
      });
      assert.equal(res.status, 403);
    });

    it('prevents users from deactivating their own account', async () => {
      const res = await send('PATCH', `/users/${superAdmin._id}/status`, {
        token: tokenFor(superAdmin),
        body: { status: 'inactive' },
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.message.includes('own account'));
    });

    it('prevents demoting or deactivating the last active Super Admin', async () => {
      const resDemote = await send('PATCH', `/users/${superAdmin._id}`, {
        token: tokenFor(superAdmin),
        body: { role: ROLES.COMPANY_ADMIN },
      });
      assert.equal(resDemote.status, 400);
    });

    it('allows updating an engineer profile and changing status', async () => {
      const res = await send('PATCH', `/users/${engineer._id}`, {
        token: tokenFor(companyAdmin),
        body: { designation: 'Chief Site Engineer' },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.designation, 'Chief Site Engineer');

      const resStatus = await send('PATCH', `/users/${engineer._id}/status`, {
        token: tokenFor(companyAdmin),
        body: { status: 'inactive' },
      });
      assert.equal(resStatus.status, 200);
      assert.equal(resStatus.body.data.status, 'inactive');
    });
  });

  describe('Roles API', () => {
    it('lists all ERP roles with metadata', async () => {
      const res = await send('GET', '/roles', { token: tokenFor(companyAdmin) });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.some((r) => r.key === 'super_admin'));
      assert.ok(res.body.data.some((r) => r.key === 'accountant'));
      assert.ok(res.body.data.some((r) => r.key === 'legal_manager'));
    });

    it('fetches single role details', async () => {
      const res = await send('GET', `/roles/${ROLES.PROJECT_MANAGER}`, { token: tokenFor(companyAdmin) });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.key, 'project_manager');
    });
  });
});

