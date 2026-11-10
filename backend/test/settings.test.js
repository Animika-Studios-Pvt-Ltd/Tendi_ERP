import './setup-db-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { AuditLog } from '../src/models/AuditLog.js';
import { startDbApp } from './helpers/dbApp.js';

let app;
const people = {};

before(async () => {
  app = await startDbApp();
  people.admin = await app.createUser('Admin', 'company_admin');
  people.pm = await app.createUser('Manager', 'project_manager');
  people.engineer = await app.createUser('Engineer', 'site_engineer');
});

after(() => app.stop());

describe('Company Settings API', () => {
  it('Rejects unauthorized roles (Site Engineer & PM get 403)', async () => {
    const res1 = await app.send('GET', '/settings', { as: people.engineer });
    assert.equal(res1.status, 403);

    const res2 = await app.send('GET', '/settings', { as: people.pm });
    assert.equal(res2.status, 403);
  });

  it('Initializes and returns default settings on first GET', async () => {
    const res = await app.send('GET', '/settings', { as: people.admin });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.preferences.currency, 'INR');
    assert.equal(res.body.data.numberingSeries.purchaseOrder.prefix, 'PO');
    assert.ok(Array.isArray(res.body.data.masterData.units));
    assert.ok(res.body.data.masterData.units.includes('bags'));
  });

  it('Updates company profile partially without wiping other sections', async () => {
    const res = await app.send('PATCH', '/settings', {
      as: people.admin,
      body: {
        companyProfile: {
          name: 'Apex Builders Ltd.',
          gstin: '29AABCU9603R1ZM',
          city: 'Bengaluru',
        },
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.companyProfile.name, 'Apex Builders Ltd.');
    assert.equal(res.body.data.companyProfile.gstin, '29AABCU9603R1ZM');
    assert.equal(res.body.data.companyProfile.city, 'Bengaluru');
    // Sibling sections preserved
    assert.equal(res.body.data.numberingSeries.purchaseOrder.prefix, 'PO');
    assert.equal(res.body.data.preferences.currency, 'INR');

    // Audit entry recorded
    await new Promise((r) => setTimeout(r, 50));
    const entry = await AuditLog.findOne({ action: 'settings.update' }).lean();
    assert.ok(entry);
    assert.equal(String(entry.actor), people.admin.id);
  });

  it('Updates numbering series and master data', async () => {
    const res = await app.send('PATCH', '/settings', {
      as: people.admin,
      body: {
        numberingSeries: {
          purchaseOrder: { prefix: 'APEX-PO', nextNumber: 100, padding: 5 },
        },
        masterData: {
          units: ['bags', 'tonnes', 'cu.m', 'boxes'],
        },
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.numberingSeries.purchaseOrder.prefix, 'APEX-PO');
    assert.equal(res.body.data.numberingSeries.purchaseOrder.nextNumber, 100);
    assert.equal(res.body.data.numberingSeries.materialRequest.prefix, 'MR');
    assert.deepEqual(res.body.data.masterData.units, ['bags', 'tonnes', 'cu.m', 'boxes']);
  });
});

