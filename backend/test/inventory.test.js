import './setup-db-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Project } from '../src/models/Project.js';
import { User } from '../src/models/User.js';
import { startDbApp } from './helpers/dbApp.js';

let app;
const people = {};
let projectA;
let projectB;

before(async () => {
  app = await startDbApp();
  people.admin = await app.createUser('Admin', 'company_admin');
  people.store = await app.createUser('StoreMgr', 'store_manager');
  people.engineer = await app.createUser('Engineer', 'site_engineer');

  projectA = await Project.create({ code: 'PRJ-INV-A', name: 'Inventory Project A', status: 'active' });
  projectB = await Project.create({ code: 'PRJ-INV-B', name: 'Inventory Project B', status: 'active' });

  await User.updateMany(
    { _id: { $in: [people.store.id, people.engineer.id] } },
    { $addToSet: { assignedProjects: { $each: [projectA._id, projectB._id] } } },
  );
});

after(() => app.stop());

describe('Inventory Management - Materials, Ledger & Stock Balances', () => {
  let cementId;

  it('Store Manager creates a material; Site Engineer is forbidden (403)', async () => {
    const forbidden = await app.send('POST', '/inventory/materials', {
      as: people.engineer,
      body: { code: 'MAT-001', name: 'Cement PPC', category: 'Cement & Concrete', unit: 'bags' },
    });
    assert.equal(forbidden.status, 403);

    const res = await app.send('POST', '/inventory/materials', {
      as: people.store,
      body: {
        code: 'MAT-CEM-01',
        name: 'UltraTech PPC Cement 50kg',
        category: 'Cement & Concrete',
        unit: 'bags',
        standardRate: 410,
        reorderLevel: 50,
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.code, 'MAT-CEM-01');
    cementId = res.body.data.id;
  });

  it('Records opening balance and issue transactions, computing real-time stock', async () => {
    // 1. Opening 100 bags
    const openRes = await app.send('POST', '/inventory/transactions', {
      as: people.store,
      body: {
        project: String(projectA._id),
        material: cementId,
        type: 'opening',
        quantity: 100,
        remarks: 'Initial site store stock',
      },
    });
    assert.equal(openRes.status, 201);
    assert.equal(openRes.body.data.delta, 100);

    // 2. Issue 60 bags (drops to 40, which is <= reorderLevel 50 => low_stock)
    const issueRes = await app.send('POST', '/inventory/transactions', {
      as: people.store,
      body: {
        project: String(projectA._id),
        material: cementId,
        type: 'issue',
        quantity: 60,
        issuedTo: 'Masonry Team Block A',
      },
    });
    assert.equal(issueRes.status, 201);
    assert.equal(issueRes.body.data.delta, -60);

    // 3. Check stock overview
    const stockRes = await app.send('GET', `/inventory/stock?project=${projectA._id}`, { as: people.engineer });
    assert.equal(stockRes.status, 200);
    assert.equal(stockRes.body.data.length, 1);
    assert.equal(stockRes.body.data[0].currentStock, 40);
    assert.equal(stockRes.body.data[0].stockStatus, 'low_stock');
    assert.equal(stockRes.body.data[0].stockValue, 40 * 410);
  });

  it('Prevents issuing more stock than available (negative stock guard)', async () => {
    const res = await app.send('POST', '/inventory/transactions', {
      as: people.store,
      body: {
        project: String(projectA._id),
        material: cementId,
        type: 'issue',
        quantity: 50, // Only 40 available
      },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /Insufficient stock/i);
  });

  it('Transfers stock between projects atomically', async () => {
    const res = await app.send('POST', '/inventory/transfers', {
      as: people.store,
      body: {
        fromProject: String(projectA._id),
        toProject: String(projectB._id),
        material: cementId,
        quantity: 15,
        remarks: 'Urgent slab pour at Project B',
      },
    });
    assert.equal(res.status, 201);

    const stockA = await app.send('GET', `/inventory/stock?project=${projectA._id}`, { as: people.store });
    const stockB = await app.send('GET', `/inventory/stock?project=${projectB._id}`, { as: people.store });
    assert.equal(stockA.body.data[0].currentStock, 25); // 40 - 15
    assert.equal(stockB.body.data[0].currentStock, 15);
  });

  it('Guard: Cannot delete material with recorded transactions', async () => {
    const res = await app.send('DELETE', `/inventory/materials/${cementId}`, { as: people.store });
    assert.equal(res.status, 400);
  });
});

