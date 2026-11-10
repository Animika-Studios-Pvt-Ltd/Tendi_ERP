import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { ACTIONS, DEFAULT_ROLES, MODULES, ROLES, toPermissionEntries } from '../src/config/rbac.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Role } from '../src/models/Role.js';
import { User, USER_STATUS } from '../src/models/User.js';
import { signAccessToken } from '../src/utils/token.js';

let server;
let baseUrl;

describe('Permission Architecture: Role-First with User Overrides', () => {
  let superAdminRole;
  let companyAdminRole;
  let siteEngineerRole;
  let superAdminUser;
  let companyAdminUser;
  let siteEngineerUser1;
  let siteEngineerUser2;

  before(async () => {
    mongoose.connection.readyState = 1;
    mock.method(AuditLog, 'create', async () => ({}));
    // Seed in-memory mock roles
    const rolesMap = new Map();
    for (const def of DEFAULT_ROLES) {
      const role = new Role({
        _id: new mongoose.Types.ObjectId(),
        key: def.key,
        name: def.name,
        description: def.description,
        dataScope: def.dataScope,
        permissions: toPermissionEntries(def.permissions),
        isSystem: true,
        isActive: true,
      });
      rolesMap.set(def.key, role);
    }

    superAdminRole = rolesMap.get(ROLES.SUPER_ADMIN);
    companyAdminRole = rolesMap.get(ROLES.COMPANY_ADMIN);
    siteEngineerRole = rolesMap.get(ROLES.SITE_ENGINEER);

    // Mock Role queries
    Role.find = (filter = {}) => ({
      sort: () => ({
        lean: async () => Array.from(rolesMap.values()),
      }),
    });
    Role.findOne = async (query) => {
      let r = null;
      if (query._id) {
        r = Array.from(rolesMap.values()).find((x) => String(x._id) === String(query._id)) || null;
      } else if (query.key) {
        r = rolesMap.get(query.key) || null;
      }
      if (r) r.save = async () => r;
      return r;
    };
    Role.findById = async (id) => {
      const r = Array.from(rolesMap.values()).find((x) => String(x._id) === String(id)) || null;
      if (r) r.save = async () => r;
      return r;
    };

    // Create mock users
    const usersMap = new Map();
    const createMockUser = (firstName, email, role) => {
      const u = new User({
        _id: new mongoose.Types.ObjectId(),
        firstName,
        lastName: 'Tester',
        email: email.toLowerCase(),
        password: 'HashedPassword123!',
        role: role._id,
        status: USER_STATUS.ACTIVE,
        phone: '+91 99999 88888',
        permissionOverrides: [],
      });
      u.role = role;
      u.populate = async () => u;
      u.save = async () => u;
      usersMap.set(String(u._id), u);
      usersMap.set(u.email, u);
      return u;
    };

    superAdminUser = createMockUser('Super', 'super@tendi.test', superAdminRole);
    companyAdminUser = createMockUser('Company', 'admin@tendi.test', companyAdminRole);
    siteEngineerUser1 = createMockUser('Engineer1', 'eng1@tendi.test', siteEngineerRole);
    siteEngineerUser2 = createMockUser('Engineer2', 'eng2@tendi.test', siteEngineerRole);

    User.findById = (id) => ({
      populate: async () => usersMap.get(String(id)) || null,
      select: () => ({
        populate: async () => usersMap.get(String(id)) || null,
      }),
    });
    User.findOne = (query) => ({
      select: () => ({
        populate: async () => {
          if (query.email) return usersMap.get(query.email.toLowerCase()) || null;
          return null;
        },
      }),
    });
    User.countDocuments = async () => 0;

    const app = createApp();
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  const send = async (method, path, { token, body } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  };

  it('Rule 1: Every role must have a predefined default permission set', () => {
    assert.ok(siteEngineerRole.permissions.length > 0);
    const map = siteEngineerRole.toPermissionMap();
    assert.ok(Array.isArray(map.projects));
    assert.ok(map.projects.includes('read'));
    assert.ok(!map.projects.includes('delete')); // Site Engineer cannot delete projects by default
  });

  it('Rule 2 & 3: New employees inherit role permissions; users with same role receive identical defaults', () => {
    assert.equal(siteEngineerUser1.permissionOverrides.length, 0);
    assert.equal(siteEngineerUser2.permissionOverrides.length, 0);

    // Both inherit role default
    assert.equal(siteEngineerUser1.can(MODULES.PROJECTS, ACTIONS.READ), true);
    assert.equal(siteEngineerUser2.can(MODULES.PROJECTS, ACTIONS.READ), true);

    assert.equal(siteEngineerUser1.can(MODULES.PROJECTS, ACTIONS.DELETE), false);
    assert.equal(siteEngineerUser2.can(MODULES.PROJECTS, ACTIONS.DELETE), false);
  });

  it('Rule 5 & 8: Super Admin can grant an override to an employee which takes precedence', async () => {
    // Grant Site Engineer 1 permission to delete projects
    const { status, body } = await send('PATCH', `/users/${siteEngineerUser1._id}/permissions`, {
      token: signAccessToken(superAdminUser),
      body: {
        permissionOverrides: [
          { module: MODULES.PROJECTS, action: ACTIONS.DELETE, granted: true },
        ],
      },
    });

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.permissionOverrides.length, 1);
    assert.equal(body.data.permissionOverrides[0].module, 'projects');
    assert.equal(body.data.permissionOverrides[0].action, 'delete');
    assert.equal(body.data.permissionOverrides[0].granted, true);

    // Engineer 1 now has delete granted via override
    assert.equal(siteEngineerUser1.can(MODULES.PROJECTS, ACTIONS.DELETE), true);
    // Engineer 2 still has role default (false)
    assert.equal(siteEngineerUser2.can(MODULES.PROJECTS, ACTIONS.DELETE), false);
  });

  it('Rule 5 & 8: Super Admin can restrict (deny) an override for an employee which takes precedence over role default', async () => {
    // Role has 'sites:create' by default. We now explicitly deny it for Engineer 1.
    assert.equal(siteEngineerRole.can(MODULES.SITES, ACTIONS.CREATE), true);

    const { status, body } = await send('PATCH', `/users/${siteEngineerUser1._id}/permissions`, {
      token: signAccessToken(superAdminUser),
      body: {
        permissionOverrides: [
          { module: MODULES.PROJECTS, action: ACTIONS.DELETE, granted: true },
          { module: MODULES.SITES, action: ACTIONS.CREATE, granted: false }, // Denied!
        ],
      },
    });

    assert.equal(status, 200);
    assert.equal(siteEngineerUser1.can(MODULES.SITES, ACTIONS.CREATE), false); // Denied by override!
    assert.equal(siteEngineerUser2.can(MODULES.SITES, ACTIONS.CREATE), true); // Engineer 2 still has role default
  });

  it('Rule 4: Super Admin modifies role-level permissions; applies to all users of that role unless override exists', async () => {
    // Modify site_engineer role to grant 'finance:approve'
    assert.equal(siteEngineerRole.can(MODULES.FINANCE, ACTIONS.APPROVE), false);

    const { status, body } = await send('PATCH', `/roles/${siteEngineerRole._id}`, {
      token: signAccessToken(superAdminUser),
      body: {
        permissions: [
          ...siteEngineerRole.permissions,
          { module: MODULES.FINANCE, actions: [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.APPROVE] },
        ],
      },
    });

    assert.equal(status, 200);
    assert.equal(body.success, true);

    // Engineer 2 has no overrides for finance:approve -> immediately inherits new role permission
    assert.equal(siteEngineerUser2.can(MODULES.FINANCE, ACTIONS.APPROVE), true);
    // Engineer 1 has no override for finance:approve -> also inherits new role permission
    assert.equal(siteEngineerUser1.can(MODULES.FINANCE, ACTIONS.APPROVE), true);

    // But Engineer 1's override on sites:create (denied) is preserved!
    assert.equal(siteEngineerUser1.can(MODULES.SITES, ACTIONS.CREATE), false);
  });

  it('Rule 7 & Reset: Clearing overrides reverts user back to role default', async () => {
    const { status, body } = await send('PATCH', `/users/${siteEngineerUser1._id}/permissions`, {
      token: signAccessToken(superAdminUser),
      body: {
        permissionOverrides: [], // Reset!
      },
    });

    assert.equal(status, 200);
    assert.equal(body.data.permissionOverrides.length, 0);

    // Now Engineer 1 falls back to role default for sites:create (which is true)
    assert.equal(siteEngineerUser1.can(MODULES.SITES, ACTIONS.CREATE), true);
    // And falls back for projects:delete (which is false)
    assert.equal(siteEngineerUser1.can(MODULES.PROJECTS, ACTIONS.DELETE), false);
  });

  it('Rule 9: Missing permissions are denied by default', () => {
    // Action not in role, not in overrides
    assert.equal(siteEngineerUser1.can('unknown_module', 'some_action'), false);
    assert.equal(siteEngineerUser1.can(MODULES.USERS, ACTIONS.DELETE), false);
  });

  it('Rule 10 & Security: Company Admin cannot configure permission overrides or edit roles', async () => {
    const overrideAttempt = await send('PATCH', `/users/${siteEngineerUser1._id}/permissions`, {
      token: signAccessToken(companyAdminUser),
      body: {
        permissionOverrides: [{ module: MODULES.PROJECTS, action: ACTIONS.DELETE, granted: true }],
      },
    });
    assert.equal(overrideAttempt.status, 403);

    const roleAttempt = await send('PATCH', `/roles/${siteEngineerRole._id}`, {
      token: signAccessToken(companyAdminUser),
      body: {
        name: 'Tampered Role',
      },
    });
    assert.equal(roleAttempt.status, 403);
  });

  it('Safety: Cannot strip management permissions from Super Admin role', async () => {
    const attempt = await send('PATCH', `/roles/${superAdminRole._id}`, {
      token: signAccessToken(superAdminUser),
      body: {
        permissions: [
          { module: MODULES.PROJECTS, actions: [ACTIONS.READ] }, // Omits 'users' update!
        ],
      },
    });
    assert.equal(attempt.status, 400);
  });

  it('Effective permission map accurately computes combined role + overrides', () => {
    siteEngineerUser1.permissionOverrides = [
      { module: MODULES.PROJECTS, action: ACTIONS.DELETE, granted: true },
      { module: MODULES.SITES, action: ACTIONS.CREATE, granted: false },
    ];

    const effective = siteEngineerUser1.toEffectivePermissionMap();
    assert.ok(effective.projects.includes('delete')); // override grant added
    assert.ok(!effective.sites.includes('create'));   // override deny removed
    assert.ok(effective.sites.includes('read'));      // role default retained
  });
});
