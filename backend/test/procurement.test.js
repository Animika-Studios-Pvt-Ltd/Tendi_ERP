import './setup-db-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Material } from '../src/models/Material.js';
import { Project } from '../src/models/Project.js';
import { User } from '../src/models/User.js';
import { startDbApp } from './helpers/dbApp.js';

let app;
const people = {};
let projectA;
let steelId;

before(async () => {
  app = await startDbApp();
  people.admin = await app.createUser('Admin', 'company_admin');
  people.pm = await app.createUser('PM', 'project_manager');
  people.proc = await app.createUser('ProcMgr', 'procurement_manager');
  people.store = await app.createUser('StoreMgr', 'store_manager');
  people.engineer = await app.createUser('Engineer', 'site_engineer');

  projectA = await Project.create({ code: 'PRJ-PROC-A', name: 'Procurement Project A', status: 'active' });

  await User.updateMany(
    { _id: { $in: [people.pm.id, people.proc.id, people.store.id, people.engineer.id] } },
    { $addToSet: { assignedProjects: projectA._id } },
  );

  const mat = await Material.create({
    code: 'MAT-STL-12',
    name: 'TMT Steel 12mm Fe550',
    category: 'Steel & Reinforcement',
    unit: 'tonnes',
    standardRate: 60000,
    reorderLevel: 5,
  });
  steelId = String(mat._id);
});

after(() => app.stop());

describe('Procurement End-to-End Pipeline (MR -> PO -> Approval Limit -> GRN -> Stock)', () => {
  let vendorId;
  let mrId;
  let poId;

  it('1. Procurement Manager registers a Vendor', async () => {
    const res = await app.send('POST', '/procurement/vendors', {
      as: people.proc,
      body: {
        code: 'VND-JSW-01',
        name: 'JSW Steel Distributors',
        contactPerson: 'Vikram Mehta',
        phone: '+91 98200 12345',
        gstin: '27AAACJ1234F1Z5',
        categories: ['Steel & Reinforcement'],
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.code, 'VND-JSW-01');
    vendorId = res.body.data.id;
  });

  it('2. Site Engineer drafts and submits a Material Request; PM approves', async () => {
    const createRes = await app.send('POST', '/procurement/requests', {
      as: people.engineer,
      body: {
        project: String(projectA._id),
        requiredByDate: '2026-12-01',
        priority: 'urgent',
        items: [{ material: steelId, quantity: 10, unit: 'tonnes' }],
        remarks: 'Required for Tower A footing reinforcement',
      },
    });
    assert.equal(createRes.status, 201);
    mrId = createRes.body.data.id;
    assert.equal(createRes.body.data.status, 'draft');

    const submitRes = await app.send('POST', `/procurement/requests/${mrId}/transition`, {
      as: people.engineer,
      body: { status: 'submitted' },
    });
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.body.data.status, 'submitted');

    const approveRes = await app.send('POST', `/procurement/requests/${mrId}/transition`, {
      as: people.pm,
      body: { status: 'approved', comment: 'Approved as per structural schedule' },
    });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.data.status, 'approved');
  });

  it('3. Creates Purchase Order with server-side tax & totals, and enforces PM approval limit', async () => {
    // 10 tonnes * 60,000 = 600,000 + 18% GST (108,000) = 708,000 > default PM limit (250,000)
    const createRes = await app.send('POST', '/procurement/purchase-orders', {
      as: people.proc,
      body: {
        project: String(projectA._id),
        vendor: vendorId,
        materialRequest: mrId,
        items: [{ material: steelId, quantity: 10, unit: 'tonnes', unitRate: 60000, taxPercent: 18 }],
      },
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.data.subtotal, 600000);
    assert.equal(createRes.body.data.taxTotal, 108000);
    assert.equal(createRes.body.data.grandTotal, 708000);
    poId = createRes.body.data.id;

    // Submit PO
    await app.send('POST', `/procurement/purchase-orders/${poId}/transition`, {
      as: people.proc,
      body: { status: 'submitted' },
    });

    // PM tries to approve -> blocked by CompanySettings limit (403)
    const pmApprove = await app.send('POST', `/procurement/purchase-orders/${poId}/transition`, {
      as: people.pm,
      body: { status: 'approved' },
    });
    assert.equal(pmApprove.status, 403);
    assert.match(pmApprove.body.error.message, /exceeds the Project Manager limit/i);

    // Company Admin approves (200)
    const adminApprove = await app.send('POST', `/procurement/purchase-orders/${poId}/transition`, {
      as: people.admin,
      body: { status: 'approved', comment: 'High-value steel PO approved' },
    });
    assert.equal(adminApprove.status, 200);
    assert.equal(adminApprove.body.data.status, 'approved');
  });

  it('4. Store Manager records partial GRN and Inventory stock updates automatically', async () => {
    const grnRes = await app.send('POST', '/procurement/goods-receipts', {
      as: people.store,
      body: {
        purchaseOrder: poId,
        challanNumber: 'DC-9981',
        items: [{ material: steelId, receivedQuantity: 6 }],
        remarks: 'First truck unloaded',
      },
    });
    assert.equal(grnRes.status, 201);
    assert.ok(grnRes.body.data.grnNumber.startsWith('GRN-'));

    // PO delivery status should be partially_received
    const poRes = await app.send('GET', `/procurement/purchase-orders/${poId}`, { as: people.proc });
    assert.equal(poRes.body.data.deliveryStatus, 'partially_received');
    assert.equal(poRes.body.data.items[0].receivedQuantity, 6);

    // Inventory stock for Project A must now show +6 tonnes!
    const stockRes = await app.send('GET', `/inventory/stock?project=${projectA._id}`, { as: people.store });
    assert.equal(stockRes.status, 200);
    assert.equal(stockRes.body.data.length, 1);
    assert.equal(stockRes.body.data[0].currentStock, 6);
  });

  it('5. Prevents receiving more than remaining ordered quantity on PO', async () => {
    const overGrn = await app.send('POST', '/procurement/goods-receipts', {
      as: people.store,
      body: {
        purchaseOrder: poId,
        items: [{ material: steelId, receivedQuantity: 5 }], // Only 4 remaining
      },
    });
    assert.equal(overGrn.status, 400);
    assert.match(overGrn.body.error.message, /Only 4 tonnes remaining/i);
  });

  it('6. Receives remaining 4 tonnes, marking PO fully_received and stock = 10', async () => {
    const grn2 = await app.send('POST', '/procurement/goods-receipts', {
      as: people.store,
      body: {
        purchaseOrder: poId,
        challanNumber: 'DC-9992',
        items: [{ material: steelId, receivedQuantity: 4 }],
      },
    });
    assert.equal(grn2.status, 201);

    const poRes = await app.send('GET', `/procurement/purchase-orders/${poId}`, { as: people.proc });
    assert.equal(poRes.body.data.deliveryStatus, 'fully_received');

    const stockRes = await app.send('GET', `/inventory/stock?project=${projectA._id}`, { as: people.store });
    assert.equal(stockRes.body.data[0].currentStock, 10);
  });
});

