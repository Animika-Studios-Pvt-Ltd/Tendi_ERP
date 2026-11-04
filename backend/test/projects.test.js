import './setup-db-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { AuditLog } from '../src/models/AuditLog.js';
import { User } from '../src/models/User.js';
import { startDbApp } from './helpers/dbApp.js';

let app;
const people = {};

before(async () => {
  app = await startDbApp();
  people.admin = await app.createUser('Admin', 'company_admin');
  people.pmA = await app.createUser('Asha', 'project_manager');
  people.pmB = await app.createUser('Bala', 'project_manager');
  people.engineer = await app.createUser('Esha', 'site_engineer');
  people.customer = await app.createUser('Kiran', 'customer');
  people.inactive = await app.createUser('Gone', 'site_engineer', { status: 'inactive' });
});

after(() => app.stop());

const validProject = (overrides = {}) => ({
  code: 'prj-001',
  name: 'Riverside Towers',
  client: { name: 'Riverside Developers', contactPerson: 'Mr. Rao', phone: '+91 98765 43210' },
  location: { city: 'Pune', state: 'Maharashtra', pincode: '411001' },
  contractValue: 125000000,
  startDate: '2026-01-10',
  plannedEndDate: '2027-06-30',
  status: 'active',
  ...overrides,
});

const create = (as, overrides) => app.send('POST', '/projects', { as, body: validProject(overrides) });
const ids = (res) => res.body.data.map((project) => project.id);

describe('create', () => {
  it('admin creates a project; code is normalised and the change is audited', async () => {
    const res = await create(people.admin, { code: 'adm-001', projectManager: people.pmA.id });
    assert.equal(res.status, 201);
    const project = res.body.data;
    assert.equal(project.code, 'ADM-001');
    assert.equal(project.client.name, 'Riverside Developers');
    assert.equal(project.projectManager.id, people.pmA.id);
    assert.equal(project.startDate.slice(0, 10), '2026-01-10');

    await new Promise((resolve) => setTimeout(resolve, 50));
    const entry = await AuditLog.findOne({ action: 'project.create', entityId: project.id }).lean();
    assert.ok(entry, 'audit entry written');
    assert.equal(String(entry.actor), people.admin.id);
  });

  it('assigns the named project manager to the project', async () => {
    const res = await create(people.admin, { code: 'adm-002', projectManager: people.pmB.id });
    const pm = await User.findById(people.pmB.id).lean();
    assert.ok(pm.assignedProjects.map(String).includes(res.body.data.id));
  });

  it('a project manager who creates a project can see it afterwards', async () => {
    const res = await create(people.pmA, { code: 'pma-001' });
    assert.equal(res.status, 201);
    assert.equal((await app.send('GET', `/projects/${res.body.data.id}`, { as: people.pmA })).status, 200);
  });

  it('validates fields and date order', async () => {
    const missing = await app.send('POST', '/projects', { as: people.admin, body: { code: '!', name: '' } });
    assert.equal(missing.status, 400);
    const fields = missing.body.error.details.map((d) => d.field);
    assert.ok(fields.includes('code') && fields.includes('name'));

    const dates = await create(people.admin, { code: 'bad-dates', startDate: '2026-05-01', plannedEndDate: '2026-04-01' });
    assert.equal(dates.status, 400);
    assert.equal(dates.body.error.details[0].field, 'plannedEndDate');
  });

  it('ignores server-controlled fields sent by the client', async () => {
    const res = await create(people.admin, { code: 'mass-001', createdBy: people.customer.id, _id: '0123456789abcdef01234567' });
    assert.equal(res.status, 201);
    assert.notEqual(res.body.data.id, '0123456789abcdef01234567');
  });

  it('rejects a duplicate code with 409', async () => {
    await create(people.admin, { code: 'dup-001' });
    const res = await create(people.admin, { code: 'DUP-001' });
    assert.equal(res.status, 409);
  });

  it('rejects an inactive project manager', async () => {
    const res = await create(people.admin, { code: 'inact-pm', projectManager: people.inactive.id });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details[0].field, 'projectManager');
  });

  it('roles without create permission get 403; anonymous requests get 401', async () => {
    assert.equal((await create(people.engineer, { code: 'eng-001' })).status, 403);
    assert.equal((await create(people.customer, { code: 'cus-001' })).status, 403);
    assert.equal((await app.send('POST', '/projects', { body: validProject({ code: 'anon-1' }) })).status, 401);
  });
});

describe('data scope', () => {
  let projectA;
  let projectB;

  before(async () => {
    projectA = (await create(people.pmA, { code: 'scope-a', name: 'Alpha Site' })).body.data;
    projectB = (await create(people.pmB, { code: 'scope-b', name: 'Bravo Site' })).body.data;
  });

  it('project managers list only their assigned projects', async () => {
    const listA = ids(await app.send('GET', '/projects?limit=100', { as: people.pmA }));
    assert.ok(listA.includes(projectA.id));
    assert.ok(!listA.includes(projectB.id));
  });

  it('out-of-scope projects are 404 for read, update and team', async () => {
    for (const [method, path, body] of [
      ['GET', `/projects/${projectB.id}`],
      ['PATCH', `/projects/${projectB.id}`, { name: 'Hijacked' }],
      ['GET', `/projects/${projectB.id}/team`],
      ['POST', `/projects/${projectB.id}/team`, { userId: people.pmA.id }],
    ]) {
      const res = await app.send(method, path, { as: people.pmA, body });
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.equal(res.body.error.message, 'Project not found');
    }
  });

  it('company admin sees every project', async () => {
    const list = ids(await app.send('GET', '/projects?limit=100', { as: people.admin }));
    assert.ok(list.includes(projectA.id) && list.includes(projectB.id));
  });

  it('site engineers and customers see nothing until they are added to the team', async () => {
    for (const viewer of [people.engineer, people.customer]) {
      assert.equal((await app.send('GET', `/projects/${projectA.id}`, { as: viewer })).status, 404);
      assert.deepEqual(ids(await app.send('GET', '/projects', { as: viewer })), []);
    }
  });

  it('malformed ids are rejected before reaching the database', async () => {
    const res = await app.send('GET', '/projects/not-an-id', { as: people.admin });
    assert.equal(res.status, 400);
  });
});

describe('team', () => {
  let project;

  before(async () => {
    project = (await create(people.admin, { code: 'team-001', projectManager: people.pmA.id })).body.data;
  });

  it('adding a member grants access; removing it revokes access', async () => {
    const add = await app.send('POST', `/projects/${project.id}/team`, { as: people.pmA, body: { userId: people.engineer.id } });
    assert.equal(add.status, 201);
    assert.equal((await app.send('GET', `/projects/${project.id}`, { as: people.engineer })).status, 200);

    const team = (await app.send('GET', `/projects/${project.id}/team`, { as: people.engineer })).body.data;
    const pm = team.find((member) => member.id === people.pmA.id);
    assert.equal(pm.isProjectManager, true);
    assert.ok(team.some((member) => member.id === people.engineer.id && !member.isProjectManager));

    const remove = await app.send('DELETE', `/projects/${project.id}/team/${people.engineer.id}`, { as: people.pmA });
    assert.equal(remove.status, 200);
    assert.equal((await app.send('GET', `/projects/${project.id}`, { as: people.engineer })).status, 404);
  });

  it('the project manager cannot be removed from the team', async () => {
    const res = await app.send('DELETE', `/projects/${project.id}/team/${people.pmA.id}`, { as: people.admin });
    assert.equal(res.status, 400);
  });

  it('inactive users cannot be added and non-members cannot be removed', async () => {
    const add = await app.send('POST', `/projects/${project.id}/team`, { as: people.admin, body: { userId: people.inactive.id } });
    assert.equal(add.status, 400);
    const remove = await app.send('DELETE', `/projects/${project.id}/team/${people.customer.id}`, { as: people.admin });
    assert.equal(remove.status, 404);
  });

  it('read-only roles cannot change the team', async () => {
    await app.send('POST', `/projects/${project.id}/team`, { as: people.admin, body: { userId: people.engineer.id } });
    const res = await app.send('POST', `/projects/${project.id}/team`, { as: people.engineer, body: { userId: people.customer.id } });
    assert.equal(res.status, 403);
  });

  it('team responses never include credentials', async () => {
    const res = await app.send('GET', `/projects/${project.id}/team`, { as: people.admin });
    for (const leak of ['password', 'failedLoginAttempts', 'passwordResetTokenHash', 'assignedProjects']) {
      assert.ok(!res.text.includes(leak), `team response contains ${leak}`);
    }
  });
});

describe('update', () => {
  let project;

  before(async () => {
    project = (await create(people.pmA, { code: 'upd-001' })).body.data;
  });

  it('merges nested fields without wiping siblings', async () => {
    const res = await app.send('PATCH', `/projects/${project.id}`, {
      as: people.pmA,
      body: { status: 'on_hold', progressPercent: 35, client: { phone: '+91 90000 00000' } },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'on_hold');
    assert.equal(res.body.data.progressPercent, 35);
    assert.equal(res.body.data.client.phone, '+91 90000 00000');
    assert.equal(res.body.data.client.name, 'Riverside Developers');
  });

  it('checks date order against the stored start date', async () => {
    const res = await app.send('PATCH', `/projects/${project.id}`, { as: people.pmA, body: { plannedEndDate: '2025-12-31' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details[0].field, 'plannedEndDate');
  });

  it('a new project manager is added to the team', async () => {
    const res = await app.send('PATCH', `/projects/${project.id}`, { as: people.pmA, body: { projectManager: people.pmB.id } });
    assert.equal(res.status, 200);
    assert.equal((await app.send('GET', `/projects/${project.id}`, { as: people.pmB })).status, 200);
  });

  it('read-only roles get 403 and empty updates are rejected', async () => {
    await app.send('POST', `/projects/${project.id}/team`, { as: people.admin, body: { userId: people.engineer.id } });
    assert.equal((await app.send('PATCH', `/projects/${project.id}`, { as: people.engineer, body: { name: 'X' } })).status, 403);
    assert.equal((await app.send('PATCH', `/projects/${project.id}`, { as: people.pmA, body: {} })).status, 400);
  });
});

describe('list: search, filter and paging', () => {
  before(async () => {
    await create(people.admin, { code: 'srch-001', name: 'Hillview Villas', status: 'planning', location: { city: 'Nashik' } });
    await create(people.admin, { code: 'srch-002', name: 'Hillview Phase 2', status: 'completed' });
  });

  it('searches name, code, client and city; filters by status', async () => {
    assert.equal((await app.send('GET', '/projects?q=hillview', { as: people.admin })).body.data.length, 2);
    assert.equal((await app.send('GET', '/projects?q=nashik', { as: people.admin })).body.data.length, 1);
    const completed = await app.send('GET', '/projects?q=hillview&status=completed', { as: people.admin });
    assert.deepEqual(completed.body.data.map((p) => p.code), ['SRCH-002']);
  });

  it('treats regex characters in search as plain text', async () => {
    const res = await app.send('GET', `/projects?q=${encodeURIComponent('(.*')}`, { as: people.admin });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 0);
  });

  it('returns pagination meta', async () => {
    const res = await app.send('GET', '/projects?limit=2&page=1&sort=name', { as: people.admin });
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.meta.limit, 2);
    assert.ok(res.body.meta.total >= 2);
  });
});

describe('user lookup', () => {
  it('lists active users with minimal fields for roles that can update projects', async () => {
    const res = await app.send('GET', '/projects/lookup/users?q=tester', { as: people.pmA });
    assert.equal(res.status, 200);
    assert.ok(!res.body.data.some((person) => person.id === people.inactive.id), 'inactive users excluded');
    assert.deepEqual(Object.keys(res.body.data[0]).sort(), ['designation', 'email', 'fullName', 'id', 'role']);
  });

  it('is forbidden to read-only roles', async () => {
    assert.equal((await app.send('GET', '/projects/lookup/users', { as: people.engineer })).status, 403);
  });
});
