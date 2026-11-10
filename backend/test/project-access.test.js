import './setup-db-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { User } from '../src/models/User.js';
import { startDbApp } from './helpers/dbApp.js';

let app;
const users = {};

before(async () => {
  app = await startDbApp();
  users.superAdmin = await app.createUser('Super', 'super_admin');
  users.companyAdmin = await app.createUser('Company', 'company_admin');
  users.pm1 = await app.createUser('Pradeep', 'project_manager');
  users.pm2 = await app.createUser('Pooja', 'project_manager');
  users.engineer1 = await app.createUser('Sanjay', 'site_engineer');
  users.engineer2 = await app.createUser('Sunita', 'site_engineer');
  users.accountant = await app.createUser('Amit', 'accountant');
  users.inactive = await app.createUser('InactiveUser', 'site_engineer', { status: 'inactive' });
});

after(() => app.stop());

const sampleProject = (code, pmId, extra = {}) => ({
  code,
  name: `Project ${code.toUpperCase()}`,
  client: { name: 'Apex Builders', contactPerson: 'Mr. Sharma', phone: '+91 91234 56789' },
  location: { city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
  contractValue: 50000000,
  startDate: '2026-02-01',
  plannedEndDate: '2026-12-31',
  status: 'active',
  projectManager: pmId,
  ...extra,
});

describe('Phase 2.4 – Project-Level Access Control', () => {
  let projectAlpha;
  let projectBeta;

  it('1. Setup projects with designated project managers', async () => {
    const resA = await app.send('POST', '/projects', {
      as: users.companyAdmin,
      body: sampleProject('alpha-01', users.pm1.id),
    });
    assert.equal(resA.status, 201);
    projectAlpha = resA.body.data;

    const resB = await app.send('POST', '/projects', {
      as: users.companyAdmin,
      body: sampleProject('beta-02', users.pm2.id),
    });
    assert.equal(resB.status, 201);
    projectBeta = resB.body.data;
  });

  it('2. Super Admin and Company Admin can access all projects without assignment', async () => {
    for (const admin of [users.superAdmin, users.companyAdmin]) {
      const getA = await app.send('GET', `/projects/${projectAlpha.id}`, { as: admin });
      assert.equal(getA.status, 200, `${admin.user.role.key} should access projectAlpha`);

      const getB = await app.send('GET', `/projects/${projectBeta.id}`, { as: admin });
      assert.equal(getB.status, 200, `${admin.user.role.key} should access projectBeta`);
    }
  });

  it('3. Project Manager can access only their assigned project', async () => {
    // PM 1 is assigned to Alpha, but NOT to Beta
    const getAlpha = await app.send('GET', `/projects/${projectAlpha.id}`, { as: users.pm1 });
    assert.equal(getAlpha.status, 200);

    const getBeta = await app.send('GET', `/projects/${projectBeta.id}`, { as: users.pm1 });
    assert.equal(getBeta.status, 404, 'PM1 must not access unassigned projectBeta');
  });

  it('4. Employee cannot access an unassigned project by manipulating URL or request ID', async () => {
    // Engineer 1 is not assigned to Alpha
    const attempt = await app.send('GET', `/projects/${projectAlpha.id}`, { as: users.engineer1 });
    assert.equal(attempt.status, 404);
    assert.equal(attempt.body.error.message, 'Project not found');

    const teamAttempt = await app.send('GET', `/projects/${projectAlpha.id}/team`, { as: users.engineer1 });
    assert.equal(teamAttempt.status, 404);
  });

  it('5. Assign employee to project grants access; removing immediately revokes access', async () => {
    // Assign Engineer 1 to project Alpha
    const addRes = await app.send('POST', `/projects/${projectAlpha.id}/team`, {
      as: users.pm1,
      body: { userId: users.engineer1.id },
    });
    assert.equal(addRes.status, 201);

    // Engineer 1 can now read Alpha
    const readAfterAdd = await app.send('GET', `/projects/${projectAlpha.id}`, { as: users.engineer1 });
    assert.equal(readAfterAdd.status, 200);

    // Remove Engineer 1 from Alpha
    const removeRes = await app.send('DELETE', `/projects/${projectAlpha.id}/team/${users.engineer1.id}`, {
      as: users.pm1,
    });
    assert.equal(removeRes.status, 200);

    // Engineer 1 is immediately denied access
    const readAfterRemove = await app.send('GET', `/projects/${projectAlpha.id}`, { as: users.engineer1 });
    assert.equal(readAfterRemove.status, 404);
  });

  it('6. One employee can belong to multiple projects simultaneously', async () => {
    // Assign Engineer 2 to both project Alpha and project Beta
    const addA = await app.send('POST', `/projects/${projectAlpha.id}/team`, {
      as: users.companyAdmin,
      body: { userId: users.engineer2.id },
    });
    assert.equal(addA.status, 201);

    const addB = await app.send('POST', `/projects/${projectBeta.id}/team`, {
      as: users.companyAdmin,
      body: { userId: users.engineer2.id },
    });
    assert.equal(addB.status, 201);

    // Engineer 2 can access both
    assert.equal((await app.send('GET', `/projects/${projectAlpha.id}`, { as: users.engineer2 })).status, 200);
    assert.equal((await app.send('GET', `/projects/${projectBeta.id}`, { as: users.engineer2 })).status, 200);
  });

  it('7. Bulk employee assignment to project', async () => {
    const bulkAdd = await app.send('POST', `/projects/${projectAlpha.id}/team`, {
      as: users.companyAdmin,
      body: { userIds: [users.engineer1.id, users.accountant.id] },
    });
    assert.equal(bulkAdd.status, 201);

    // Both now have access
    assert.equal((await app.send('GET', `/projects/${projectAlpha.id}`, { as: users.engineer1 })).status, 200);
    assert.equal((await app.send('GET', `/projects/${projectAlpha.id}`, { as: users.accountant })).status, 200);
  });

  it('8. Duplicate assignments are prevented', async () => {
    // Engineer 1 is already assigned to project Alpha
    const dupAttempt = await app.send('POST', `/projects/${projectAlpha.id}/team`, {
      as: users.companyAdmin,
      body: { userId: users.engineer1.id },
    });
    assert.equal(dupAttempt.status, 400);
    assert.match(dupAttempt.body.error.message, /already assigned/i);
  });

  it('9. Inactive employees cannot be assigned to a project', async () => {
    const inactiveAttempt = await app.send('POST', `/projects/${projectAlpha.id}/team`, {
      as: users.companyAdmin,
      body: { userId: users.inactive.id },
    });
    assert.equal(inactiveAttempt.status, 400);
  });

  it('10. Project Manager designation validation rejects ineligible roles', async () => {
    // Engineer has role 'site_engineer' which is not an authorized management role
    const invalidPmAttempt = await app.send('POST', '/projects', {
      as: users.companyAdmin,
      body: sampleProject('bad-pm-01', users.engineer1.id),
    });
    assert.equal(invalidPmAttempt.status, 400);
    assert.equal(invalidPmAttempt.body.error.details[0].field, 'projectManager');
  });

  it('11. Project Manager designation does NOT bypass role permissions', async () => {
    // PM role has projects: [C, R, U, A, X], but does NOT have finance:delete or users:create
    assert.equal(users.pm1.user.can('users', 'create'), false);

    const bypassAttempt = await app.send('POST', '/users', {
      as: users.pm1,
      body: {
        firstName: 'Unauthorized',
        email: 'unauth@tendi.test',
        password: 'Password123!',
        role: String(users.engineer1.user.role._id),
      },
    });
    assert.equal(bypassAttempt.status, 403);
  });

  it('12. Individual permission overrides continue to work alongside project assignment', async () => {
    // User is assigned to project Alpha, but we deny them projects:read via individual override
    await User.updateOne(
      { _id: users.engineer1.id },
      {
        permissionOverrides: [{ module: 'projects', action: 'read', granted: false }],
      },
    );

    const deniedByOverride = await app.send('GET', `/projects/${projectAlpha.id}`, { as: users.engineer1 });
    assert.equal(deniedByOverride.status, 403, 'Override denying projects:read must be enforced');

    // Clean up override
    await User.updateOne({ _id: users.engineer1.id }, { permissionOverrides: [] });
    const allowedAgain = await app.send('GET', `/projects/${projectAlpha.id}`, { as: users.engineer1 });
    assert.equal(allowedAgain.status, 200);
  });

  it('13. Managing project assignments from the User module', async () => {
    // Assign project Beta to Engineer 1 via /users/:id/projects
    const assignRes = await app.send('POST', `/users/${users.engineer1.id}/projects`, {
      as: users.companyAdmin,
      body: { projectId: projectBeta.id },
    });
    assert.equal(assignRes.status, 200);

    // Engineer 1 can now read Beta
    assert.equal((await app.send('GET', `/projects/${projectBeta.id}`, { as: users.engineer1 })).status, 200);

    // Remove Beta assignment from Engineer 1 via /users/:id/projects/:projectId
    const removeRes = await app.send('DELETE', `/users/${users.engineer1.id}/projects/${projectBeta.id}`, {
      as: users.companyAdmin,
    });
    assert.equal(removeRes.status, 200);

    // Access to Beta revoked
    assert.equal((await app.send('GET', `/projects/${projectBeta.id}`, { as: users.engineer1 })).status, 404);
  });

  it('14. Cannot remove the designated Project Manager from project without reassignment', async () => {
    // PM 1 is designated PM for project Alpha
    const attempt = await app.send('DELETE', `/users/${users.pm1.id}/projects/${projectAlpha.id}`, {
      as: users.companyAdmin,
    });
    assert.equal(attempt.status, 400);
    assert.match(attempt.body.error.message, /designated Project Manager/i);
  });
});
