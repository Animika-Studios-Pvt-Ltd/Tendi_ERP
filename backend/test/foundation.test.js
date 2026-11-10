import './setup-db-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { MODULES } from '../src/config/rbac.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { CompanySettings } from '../src/models/CompanySettings.js';
import { Material } from '../src/models/Material.js';
import { Project } from '../src/models/Project.js';
import { Role } from '../src/models/Role.js';
import { Site } from '../src/models/Site.js';
import { User } from '../src/models/User.js';
import { assertFileAccess } from '../src/services/files/fileAccess.js';
import { nextSequenceNumber } from '../src/services/sequence.service.js';
import { startDbApp } from './helpers/dbApp.js';

let app;
const people = {};
let projectA;
let projectB;
let siteA;
let matA;

before(async () => {
  app = await startDbApp();
  people.superAdmin = await app.createUser('Super', 'super_admin');
  people.admin = await app.createUser('Admin', 'company_admin');
  people.pmA = await app.createUser('PMA', 'project_manager');
  people.pmB = await app.createUser('PMB', 'project_manager');
  people.engineer = await app.createUser('EngA', 'site_engineer');
  people.store = await app.createUser('StoreA', 'store_manager');
  people.customer = await app.createUser('CustA', 'customer');

  projectA = await Project.create({ code: 'PRJ-FND-A', name: 'Foundation Project Alpha', status: 'active' });
  projectB = await Project.create({ code: 'PRJ-FND-B', name: 'Secret Beta Tower', status: 'active' });

  await User.updateMany(
    { _id: { $in: [people.pmA.id, people.engineer.id, people.store.id] } },
    { $addToSet: { assignedProjects: projectA._id } },
  );
  await User.updateOne({ _id: people.pmB.id }, { $addToSet: { assignedProjects: projectB._id } });

  siteA = await Site.create({
    code: 'SITE-FND-A',
    name: 'Alpha North Site',
    project: projectA._id,
    status: 'active',
  });

  matA = await Material.create({
    code: 'MAT-FND-1',
    name: 'Foundation OPC Cement',
    category: 'Cement & Concrete',
    unit: 'bags',
    standardRate: 380,
  });
});

after(() => app.stop());

describe('Release 0 – Shared Foundation, Security & Platform Services', () => {
  it('blocks users without approve/reject permissions from approving DPRs or MRs (403)', async () => {
    const dprRes = await app.send('POST', '/sites/dpr', {
      as: people.engineer,
      body: {
        project: String(projectA._id),
        site: String(siteA._id),
        reportDate: '2026-11-10',
        workDone: [{ description: 'Footing PCC', quantity: 10, unit: 'cu.m' }],
      },
    });
    assert.equal(dprRes.status, 201);
    const dprId = dprRes.body.data.id;

    // Submit
    const subRes = await app.send('POST', `/sites/dpr/${dprId}/transition`, {
      as: people.engineer,
      body: { status: 'submitted' },
    });
    assert.equal(subRes.status, 200);

    // Site Engineer cannot approve or reject DPR
    const engApprove = await app.send('POST', `/sites/dpr/${dprId}/transition`, {
      as: people.engineer,
      body: { status: 'approved' },
    });
    assert.equal(engApprove.status, 403);

    const engReject = await app.send('POST', `/sites/dpr/${dprId}/transition`, {
      as: people.engineer,
      body: { status: 'rejected', comment: 'Self reject' },
    });
    assert.equal(engReject.status, 403);

    // PM returns DPR for correction -> Engineer edits -> resubmits -> PM approves
    const pmReturn = await app.send('POST', `/sites/dpr/${dprId}/transition`, {
      as: people.pmA,
      body: { status: 'returned', comment: 'Add cement bag count' },
    });
    assert.equal(pmReturn.status, 200);
    assert.equal(pmReturn.body.data.status, 'returned');

    const editRes = await app.send('PATCH', `/sites/dpr/${dprId}`, {
      as: people.engineer,
      body: { remarks: 'Updated with bag count' },
    });
    assert.equal(editRes.status, 200);

    await app.send('POST', `/sites/dpr/${dprId}/transition`, {
      as: people.engineer,
      body: { status: 'submitted' },
    });

    // Store Manager cannot approve Material Request
    const mrRes = await app.send('POST', '/procurement/requests', {
      as: people.store,
      body: {
        project: String(projectA._id),
        requiredByDate: '2026-12-10',
        items: [{ material: String(matA._id), quantity: 50, unit: 'bags' }],
      },
    });
    assert.equal(mrRes.status, 201);
    const mrId = mrRes.body.data.id;
    await app.send('POST', `/procurement/requests/${mrId}/transition`, {
      as: people.store,
      body: { status: 'submitted' },
    });
    const storeApproveMr = await app.send('POST', `/procurement/requests/${mrId}/transition`, {
      as: people.store,
      body: { status: 'approved' },
    });
    assert.equal(storeApproveMr.status, 403);
  });

  it('enforces maker-checker when a non-admin PM submits a DPR themselves', async () => {
    const dprRes = await app.send('POST', '/sites/dpr', {
      as: people.pmA,
      body: {
        project: String(projectA._id),
        site: String(siteA._id),
        reportDate: '2026-11-11',
      },
    });
    const dprId = dprRes.body.data.id;
    await app.send('POST', `/sites/dpr/${dprId}/transition`, {
      as: people.pmA,
      body: { status: 'submitted' },
    });

    const selfApprove = await app.send('POST', `/sites/dpr/${dprId}/transition`, {
      as: people.pmA,
      body: { status: 'approved' },
    });
    assert.equal(selfApprove.status, 403);
    assert.match(selfApprove.body.error.message, /Maker-checker/i);

    const adminApprove = await app.send('POST', `/sites/dpr/${dprId}/transition`, {
      as: people.admin,
      body: { status: 'approved' },
    });
    assert.equal(adminApprove.status, 200);
  });

  it('honors individual permissionOverrides in fileAccess.js', async () => {
    const roleDoc = await Role.findOne({ key: 'site_engineer' });
    const userDoc = await User.findById(people.engineer.id).populate('role');
    assert.ok(roleDoc);

    // Strip documents:read override if any, verify role default works first, then test negative & positive override
    userDoc.permissionOverrides = [{ module: MODULES.DOCUMENTS, action: 'read', granted: false }];
    assert.throws(
      () => assertFileAccess(userDoc, { _id: '64b1f1f1f1f1f1f1f1f1f1f1', project: projectA._id, uploadedBy: people.pmA.id }),
      /cannot read in documents/i,
    );

    userDoc.permissionOverrides = [{ module: MODULES.DOCUMENTS, action: 'read', granted: true }];
    assert.doesNotThrow(() =>
      assertFileAccess(userDoc, { _id: '64b1f1f1f1f1f1f1f1f1f1f1', project: projectA._id, uploadedBy: people.pmA.id }),
    );
  });

  it('generates concurrent atomic document numbers from CompanySettings.numberingSeries', async () => {
    await CompanySettings.findOneAndUpdate(
      { key: 'default' },
      { $set: { 'numberingSeries.purchaseOrder': { prefix: 'TPO', nextNumber: 50, padding: 4 } } },
      { upsert: true },
    );

    const numbers = await Promise.all(
      Array.from({ length: 5 }, () => nextSequenceNumber('purchaseOrder', { contextCode: 'ALPHA' })),
    );
    assert.equal(new Set(numbers).size, 5);
    assert.ok(numbers.every((n) => n.startsWith('TPO-ALPHA-005')));
  });

  it('lists notifications, pending approvals, and marks notifications read', async () => {
    const pendingRes = await app.send('GET', '/notifications/pending-approvals', { as: people.pmA });
    assert.equal(pendingRes.status, 200);
    assert.ok(pendingRes.body.data.length >= 1);
    assert.ok(pendingRes.body.data.some((p) => p.type === 'Daily Progress Report' || p.type === 'Material Request'));

    const notifRes = await app.send('GET', '/notifications', { as: people.pmA });
    assert.equal(notifRes.status, 200);
    assert.ok(notifRes.body.data.length >= 1);
    assert.ok(notifRes.body.meta.unreadCount >= 1);

    const firstId = notifRes.body.data[0].id;
    const readRes = await app.send('PATCH', `/notifications/${firstId}/read`, { as: people.pmA });
    assert.equal(readRes.status, 200);
    assert.equal(readRes.body.data.isRead, true);
  });

  it('records role updates in AuditLog and serves paginated GET /users/audit-logs', async () => {
    const engineerRole = await Role.findOne({ key: 'site_engineer' });
    const patchRes = await app.send('PATCH', `/roles/${engineerRole._id}`, {
      as: people.superAdmin,
      body: { description: 'Records daily site progress and issues.' },
    });
    assert.equal(patchRes.status, 200);

    await new Promise((r) => setTimeout(r, 50));
    const entry = await AuditLog.findOne({ action: 'role.update', entityId: engineerRole._id }).lean();
    assert.ok(entry);

    const logsRes = await app.send('GET', '/users/audit-logs?module=users&limit=10', { as: people.admin });
    assert.equal(logsRes.status, 200);
    assert.ok(logsRes.body.data.some((l) => l.action === 'role.update'));

    const forbiddenLogs = await app.send('GET', '/users/audit-logs', { as: people.engineer });
    assert.equal(forbiddenLogs.status, 403);
  });

  it('global search respects RBAC and project access boundaries', async () => {
    const pmARes = await app.send('GET', '/search?q=Foundation', { as: people.pmA });
    assert.equal(pmARes.status, 200);
    assert.ok(pmARes.body.data.some((r) => r.code === 'PRJ-FND-A'));

    const secretRes = await app.send('GET', '/search?q=Secret', { as: people.pmA });
    assert.equal(secretRes.status, 200);
    assert.equal(secretRes.body.data.length, 0);
  });

  it('serves settings master-data to non-admin authenticated roles', async () => {
    const res = await app.send('GET', '/settings/master-data', { as: people.store });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.masterData.units));
    assert.ok(Array.isArray(res.body.data.masterData.materialCategories));
  });
});

