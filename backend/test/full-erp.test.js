import './setup-db-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Material } from '../src/models/Material.js';
import { Project } from '../src/models/Project.js';
import { Site } from '../src/models/Site.js';
import { User } from '../src/models/User.js';
import { Vendor } from '../src/models/Vendor.js';
import { startDbApp } from './helpers/dbApp.js';

let app;
const people = {};
let projectA;
let siteA;
let matSteel;
let vendorA;
let vendorB;
let dprId;
let poId;
let grnId;
let contractorId;
let workOrderId;
let raBillId;
let ncrId;

before(async () => {
  app = await startDbApp();
  people.admin = await app.createUser('ErpAdmin', 'company_admin');
  people.pmA = await app.createUser('ErpPM', 'project_manager');
  people.pmReviewer = await app.createUser('ErpPM2', 'project_manager');
  people.engineer = await app.createUser('ErpEng', 'site_engineer');
  people.accountant = await app.createUser('ErpAcc', 'accountant');
  people.customer = await app.createUser('ErpCust', 'customer');

  projectA = await Project.create({
    code: 'PRJ-FULL-1',
    name: '=cmd|Metro Phase 1',
    status: 'active',
    contractValue: 10000000,
    startDate: new Date('2026-01-01T00:00:00Z'),
    plannedEndDate: new Date('2026-12-31T00:00:00Z'),
  });

  await User.updateMany(
    { _id: { $in: [people.pmA.id, people.pmReviewer.id, people.engineer.id, people.accountant.id, people.customer.id] } },
    { $addToSet: { assignedProjects: projectA._id } },
  );

  siteA = await Site.create({ code: 'SITE-FULL-1', name: 'North Depot', project: projectA._id, status: 'active' });

  matSteel = await Material.create({
    code: 'MAT-TMT-16',
    name: 'TMT Steel 16mm',
    category: 'Steel & Reinforcement',
    unit: 'tonnes',
    barcode: 'BAR-TMT-16',
    standardRate: 62000,
    reorderLevel: 5,
  });

  vendorA = await Vendor.create({ code: 'VND-FULL-A', name: 'Bharat Steel Corp' });
  vendorB = await Vendor.create({ code: 'VND-FULL-B', name: 'Deccan Rebars Ltd' });
});

after(() => app.stop());

describe('Releases 3–7 – Full Integrated ERP Modules, Approvals, Controls & Reporting', () => {
  it('Documents & Drawings: revisions supersede prior approved revs, visibility isolates customer, RFIs & Transmittals work', async () => {
    const docRes = await app.send('POST', '/documents', {
      as: people.pmA,
      body: { title: 'Internal Structural Audit Note', project: String(projectA._id), folder: 'Structural', visibility: 'internal' },
    });
    assert.equal(docRes.status, 201);
    const docId = docRes.body.data.id;

    const verRes = await app.send('POST', `/documents/${docId}/versions`, {
      as: people.pmA,
      body: { notes: 'Updated load tables' },
    });
    assert.equal(verRes.status, 201);
    assert.equal(verRes.body.data.currentVersion, 2);

    // Customer only sees client/all visibility documents
    const custDocs = await app.send('GET', '/documents', { as: people.customer });
    assert.equal(custDocs.status, 200);
    assert.equal(custDocs.body.data.length, 0);

    // Drawing revision approval supersedes R0 -> obsolete
    const drwRes = await app.send('POST', '/documents/drawings', {
      as: people.pmA,
      body: { title: 'Footing Reinforcement Plan', project: String(projectA._id), discipline: 'structural', revCode: 'R0' },
    });
    assert.equal(drwRes.status, 201);
    const drwId = drwRes.body.data.id;
    const rev0Id = drwRes.body.data.revisions[0]._id;

    const appR0 = await app.send('POST', `/documents/drawings/${drwId}/revisions/${rev0Id}/review`, {
      as: people.pmReviewer,
      body: { status: 'approved' },
    });
    assert.equal(appR0.status, 200);

    const addR1 = await app.send('POST', `/documents/drawings/${drwId}/revisions`, {
      as: people.pmA,
      body: { revCode: 'R1', notes: 'Revised bar spacing' },
    });
    assert.equal(addR1.status, 201);
    const rev1Id = addR1.body.data.revisions[1]._id;

    const appR1 = await app.send('POST', `/documents/drawings/${drwId}/revisions/${rev1Id}/review`, {
      as: people.pmReviewer,
      body: { status: 'approved' },
    });
    assert.equal(appR1.status, 200);
    assert.equal(appR1.body.data.currentRevisionCode, 'R1');
    assert.equal(appR1.body.data.revisions[0].status, 'obsolete');

    // RFI & Transmittal
    const rfi = await app.send('POST', '/documents/rfis', {
      as: people.pmA,
      body: { project: String(projectA._id), drawingRef: drwId, subject: 'Lap length check', question: 'Confirm L40d splice zone' },
    });
    assert.equal(rfi.status, 201);
    const ansRfi = await app.send('PATCH', `/documents/rfis/${rfi.body.data.id}`, {
      as: people.pmReviewer,
      body: { response: 'Use 50d for tension lap' },
    });
    assert.equal(ansRfi.status, 200);
    assert.equal(ansRfi.body.data.status, 'answered');

    const trn = await app.send('POST', '/documents/transmittals', {
      as: people.pmA,
      body: { project: String(projectA._id), recipientName: 'MetroPMC', subject: 'IFC Structural Set', drawingIds: [drwId] },
    });
    assert.equal(trn.status, 201);
  });

  it('Sites, Inventory Depth & Procurement Depth: RFQ award -> PO -> GRN -> Weighted Valuation -> DPR consumption & Return', async () => {
    // Barcode lookup
    const barRes = await app.send('GET', '/inventory/materials/by-code/BAR-TMT-16', { as: people.pmA });
    assert.equal(barRes.status, 200);
    assert.equal(barRes.body.data.code, 'MAT-TMT-16');

    // Warehouse
    const whRes = await app.send('POST', '/inventory/warehouses', {
      as: people.admin,
      body: { code: 'WH-NORTH', name: 'North Podium Store', project: String(projectA._id), site: String(siteA._id) },
    });
    assert.equal(whRes.status, 201);

    // RFQ + Quotes + Award -> Auto PO
    const rfqRes = await app.send('POST', '/procurement/rfqs', {
      as: people.admin,
      body: {
        title: '16mm Rebar Bulk Supply',
        project: String(projectA._id),
        vendors: [String(vendorA._id), String(vendorB._id)],
        items: [{ material: String(matSteel._id), quantity: 20, unit: 'tonnes' }],
      },
    });
    assert.equal(rfqRes.status, 201);
    const rfqId = rfqRes.body.data.id;

    await app.send('POST', `/procurement/rfqs/${rfqId}/quotations`, {
      as: people.admin,
      body: { vendor: String(vendorA._id), items: [{ material: String(matSteel._id), unitRate: 63000, taxPercent: 18 }] },
    });
    await app.send('POST', `/procurement/rfqs/${rfqId}/quotations`, {
      as: people.admin,
      body: { vendor: String(vendorB._id), items: [{ material: String(matSteel._id), unitRate: 60000, taxPercent: 18 }] },
    });

    const awardRes = await app.send('POST', `/procurement/rfqs/${rfqId}/award`, {
      as: people.admin,
      body: { vendor: String(vendorB._id) },
    });
    assert.equal(awardRes.status, 201);
    poId = awardRes.body.data.poId;

    // Submit & Approve PO as Admin (60000*20*1.18 = 1,416,000 > pmLimit)
    await app.send('POST', `/procurement/purchase-orders/${poId}/transition`, {
      as: people.pmA,
      body: { status: 'submitted' },
    });
    const appPo = await app.send('POST', `/procurement/purchase-orders/${poId}/transition`, {
      as: people.admin,
      body: { status: 'approved' },
    });
    assert.equal(appPo.status, 200);

    // GRN 20 tonnes received
    const grnRes = await app.send('POST', '/procurement/goods-receipts', {
      as: people.admin,
      body: {
        purchaseOrder: poId,
        site: String(siteA._id),
        items: [{ material: String(matSteel._id), receivedQuantity: 20 }],
      },
    });
    assert.equal(grnRes.status, 201);
    grnId = grnRes.body.data.id;

    // Weighted-average valuation confirms 60,000 rate (from awarded PO)
    const valRes = await app.send('GET', `/inventory/valuation?project=${projectA._id}`, { as: people.pmA });
    assert.equal(valRes.status, 200);
    assert.equal(valRes.body.data[0].weightedAvgRate, 60000);

    // DPR with linked Material -> Approve -> Post Consumption (deducts 3t) + idempotency guard
    const dprRes = await app.send('POST', '/sites/dpr', {
      as: people.engineer,
      body: {
        project: String(projectA._id),
        site: String(siteA._id),
        reportDate: '2026-04-10',
        materialUsage: [{ material: String(matSteel._id), materialName: 'TMT Steel 16mm', quantity: 3, unit: 'tonnes' }],
      },
    });
    assert.equal(dprRes.status, 201);
    dprId = dprRes.body.data.id;

    await app.send('POST', `/sites/dpr/${dprId}/transition`, { as: people.engineer, body: { status: 'submitted' } });
    await app.send('POST', `/sites/dpr/${dprId}/transition`, { as: people.pmA, body: { status: 'approved' } });

    const postCons = await app.send('POST', `/sites/dpr/${dprId}/post-consumption`, { as: people.pmA, body: {} });
    assert.equal(postCons.status, 200);
    assert.equal(postCons.body.data.postedCount, 1);

    const dupCons = await app.send('POST', `/sites/dpr/${dprId}/post-consumption`, { as: people.pmA, body: {} });
    assert.equal(dupCons.status, 400);

    // Purchase Return of 2 tonnes & Site Instruction
    const retRes = await app.send('POST', '/procurement/returns', {
      as: people.admin,
      body: {
        purchaseOrder: poId,
        goodsReceipt: grnId,
        reason: 'Bent bar batch',
        items: [{ material: String(matSteel._id), returnedQuantity: 2, unit: 'tonnes' }],
      },
    });
    assert.equal(retRes.status, 201);

    const siRes = await app.send('POST', '/sites/instructions', {
      as: people.pmA,
      body: { project: String(projectA._id), site: String(siteA._id), subject: 'Curing schedule', instruction: 'Pond slab for 7 days', priority: 'high' },
    });
    assert.equal(siRes.status, 201);

    // Stock Verification cycle count adjusts remaining 15t -> 14t on approval
    const verCreate = await app.send('POST', '/inventory/verifications', {
      as: people.admin,
      body: {
        project: String(projectA._id),
        items: [{ material: String(matSteel._id), physicalQty: 14, reason: 'Cut scrap allowance' }],
      },
    });
    assert.equal(verCreate.status, 201);
    assert.equal(verCreate.body.data.items[0].variance, -1);

    const subVer = await app.send('POST', `/inventory/verifications/${verCreate.body.data.id}/transition`, { as: people.admin, body: { status: 'submitted' } });
    assert.equal(subVer.status, 200);
    // pmA has inventory:R only so cannot approve stock adjustment
    const pmVerFail = await app.send('POST', `/inventory/verifications/${verCreate.body.data.id}/transition`, { as: people.pmA, body: { status: 'approved' } });
    assert.equal(pmVerFail.status, 403);
    // Note: use pmReviewer/different approver? No, admin is allowed maker-checker bypass per approval.service, or better yet let's test Store Manager submit -> Admin approve!
    const verApp = await app.send('POST', `/inventory/verifications/${verCreate.body.data.id}/transition`, { as: people.admin, body: { status: 'approved' } });
    assert.equal(verApp.status, 200);
    assert.equal(verApp.body.data.adjustmentsPosted, true);
  });

  it('Finance & Contractors: Budgets, Expense PM limit, 3-way AP Invoice, RA Bill cascade & Payment balance guard', async () => {
    // Budget
    const budRes = await app.send('POST', '/finance/budgets', {
      as: people.accountant,
      body: { project: String(projectA._id), originalBudget: 8000000, contingencyAmount: 500000 },
    });
    assert.equal(budRes.status, 201);

    // Expense > ₹50,000 pmLimit blocks PM approval (403)
    const expRes = await app.send('POST', '/finance/expenses', {
      as: people.engineer,
      body: { project: String(projectA._id), description: 'Emergency DG Generator Hire', amount: 75000, taxAmount: 0 },
    });
    assert.equal(expRes.status, 201);
    await app.send('POST', `/finance/expenses/${expRes.body.data.id}/transition`, { as: people.engineer, body: { status: 'submitted' } });

    const pmExpFail = await app.send('POST', `/finance/expenses/${expRes.body.data.id}/transition`, { as: people.pmA, body: { status: 'approved' } });
    assert.equal(pmExpFail.status, 403);

    const adminExpOk = await app.send('POST', `/finance/expenses/${expRes.body.data.id}/transition`, { as: people.admin, body: { status: 'approved' } });
    assert.equal(adminExpOk.status, 200);

    // Vendor AP Invoice 3-way match against PO + GRN (PO subtotal was 1,200,000)
    const badInv = await app.send('POST', '/finance/invoices', {
      as: people.accountant,
      body: { invoiceType: 'vendor_ap', project: String(projectA._id), vendor: String(vendorB._id), purchaseOrder: poId, goodsReceipt: grnId, subtotal: 1500000 },
    });
    assert.equal(badInv.status, 400);

    const okInv = await app.send('POST', '/finance/invoices', {
      as: people.accountant,
      body: { invoiceType: 'vendor_ap', project: String(projectA._id), vendor: String(vendorB._id), purchaseOrder: poId, goodsReceipt: grnId, subtotal: 1200000, cgstAmount: 108000, sgstAmount: 108000 },
    });
    assert.equal(okInv.status, 201);
    assert.equal(okInv.body.data.threeWayMatchPassed, true);

    // Overpayment blocked; partial payment marks partial
    const overPay = await app.send('POST', '/finance/payments', {
      as: people.accountant,
      body: { invoice: okInv.body.data.id, amount: 2000000 },
    });
    assert.equal(overPay.status, 400);

    const payOk = await app.send('POST', '/finance/payments', {
      as: people.accountant,
      body: { invoice: okInv.body.data.id, amount: 500000, mode: 'neft', referenceNo: 'UTR-9988' },
    });
    assert.equal(payOk.status, 201);
    assert.equal(payOk.body.data.invoiceStatus, 'partial');

    // Contractor + Work Order + Measurement Book + RA Bill -> Auto Finance Invoice on approval
    const conRes = await app.send('POST', '/contractors/contractors', {
      as: people.admin,
      body: { companyName: 'Apex Civil Formwork', tradeCategories: ['Shuttering', 'RCC'] },
    });
    assert.equal(conRes.status, 201);
    contractorId = conRes.body.data.id;

    const woRes = await app.send('POST', '/contractors/work-orders', {
      as: people.admin,
      body: { project: String(projectA._id), contractor: contractorId, title: 'Podium Shuttering', contractValue: 1500000, retentionPercent: 5, tdsPercent: 2 },
    });
    assert.equal(woRes.status, 201);
    workOrderId = woRes.body.data.id;

    const mbRes = await app.send('POST', '/contractors/measurements', {
      as: people.admin,
      body: { workOrder: workOrderId, description: 'Slab Formwork', unit: 'sq.ft', length: 50, width: 20, rate: 100 },
    });
    assert.equal(mbRes.status, 201);
    assert.equal(mbRes.body.data.quantity, 1000);
    assert.equal(mbRes.body.data.amount, 100000);

    const billRes = await app.send('POST', '/contractors/bills', {
      as: people.admin,
      body: { workOrder: workOrderId, cumulativeWorkValue: 200000, gstPercent: 18 },
    });
    assert.equal(billRes.status, 201);
    raBillId = billRes.body.data.id;

    await app.send('POST', `/contractors/bills/${raBillId}/transition`, { as: people.admin, body: { status: 'submitted' } });
    const appBill = await app.send('POST', `/contractors/bills/${raBillId}/transition`, { as: people.pmReviewer, body: { status: 'approved' } });
    assert.equal(appBill.status, 200);
    assert.ok(appBill.body.data.financeInvoice);

    const ccRes = await app.send('GET', `/finance/cost-control?project=${projectA._id}`, { as: people.accountant });
    assert.equal(ccRes.status, 200);
    assert.ok(ccRes.body.data.actuals.totalActualCost > 0);
  });

  it('HR, Equipment, Quality/Safety, Legal, CRM, Dashboard & Reports (with RBAC & CSV injection protection)', async () => {
    // HR Employee + Bulk Attendance + Payroll Run
    const emp1 = await app.send('POST', '/hr/employees', {
      as: people.admin,
      body: { fullName: 'Ramesh Kumar', workerCategory: 'company_employee', wageType: 'daily', baseRate: 1000, overtimeRate: 150, assignedProjects: [String(projectA._id)] },
    });
    assert.equal(emp1.status, 201);

    const empPool = await app.send('POST', '/hr/employees', {
      as: people.admin,
      body: { fullName: 'Suresh Helper', workerCategory: 'daily_wage_labour', wageType: 'daily', baseRate: 700, assignedProjects: [] },
    });
    assert.equal(empPool.status, 201);

    const empList = await app.send('GET', `/hr/employees?project=${projectA._id}`, { as: people.admin });
    assert.equal(empList.status, 200);
    assert.ok(empList.body.data.some((e) => e.id === emp1.body.data.id));
    assert.ok(empList.body.data.some((e) => e.id === empPool.body.data.id));

    const att = await app.send('POST', '/hr/attendance/bulk', {
      as: people.admin,
      body: {
        project: String(projectA._id),
        date: '2026-04-12',
        records: [{ employee: emp1.body.data.id, status: 'present', regularHours: 8, overtimeHours: 2 }],
      },
    });
    assert.equal(att.status, 201);

    const payroll = await app.send('POST', '/hr/payroll/runs', {
      as: people.admin,
      body: { project: String(projectA._id), month: '2026-04' },
    });
    assert.equal(payroll.status, 201);
    assert.equal(payroll.body.data.entries[0].presentDays, 1);
    assert.equal(payroll.body.data.totalGross, 1300); // 1000 + 2*150

    // Equipment (Admin adds asset) + PM records breakdown log flipping status to maintenance
    const eqRes = await app.send('POST', '/equipment', {
      as: people.admin,
      body: { name: 'Tower Crane #1', ownershipType: 'rented', dailyRate: 8500, project: String(projectA._id), site: String(siteA._id) },
    });
    assert.equal(eqRes.status, 201);

    const logRes = await app.send('POST', '/equipment/logs', {
      as: people.pmA,
      body: { equipment: eqRes.body.data.id, project: String(projectA._id), logType: 'breakdown', resolved: false, description: 'Hoist brake sensor fault' },
    });
    assert.equal(logRes.status, 201);

    // Quality NCR feeds Project Readiness blocker
    const ncrRes = await app.send('POST', '/quality-safety/ncrs', {
      as: people.pmA,
      body: { project: String(projectA._id), site: String(siteA._id), title: 'Honeycombing in C12 column', severity: 'critical' },
    });
    assert.equal(ncrRes.status, 201);
    ncrId = ncrRes.body.data.id;

    const readyCheck = await app.send('GET', `/projects/${projectA._id}/readiness`, { as: people.pmA });
    assert.equal(readyCheck.status, 200);
    assert.equal(readyCheck.body.data.metrics.openNcrs, 1);

    // Safety incident
    const safRes = await app.send('POST', '/quality-safety/incidents', {
      as: people.pmA,
      body: { project: String(projectA._id), incidentType: 'toolbox_talk', title: 'Working at height TBT', attendeesCount: 24 },
    });
    assert.equal(safRes.status, 201);

    // Legal permit expiring within 30 days & agreement
    const tomorrow = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const prmRes = await app.send('POST', '/legal/permits', {
      as: people.admin,
      body: { title: 'Labor Licence', authorityOrInsurer: 'State Labor Dept', project: String(projectA._id), expiryDate: tomorrow },
    });
    assert.equal(prmRes.status, 201);
    const expList = await app.send('GET', '/legal/expiring?days=30', { as: people.admin });
    assert.equal(expList.status, 200);
    assert.equal(expList.body.data.length, 1);

    // CRM Client & Handover
    const cliRes = await app.send('POST', '/crm/clients', {
      as: people.admin,
      body: { name: 'Metro Rail Authority', city: 'Pune' },
    });
    assert.equal(cliRes.status, 201);
    const hoRes = await app.send('POST', '/crm/handovers', {
      as: people.admin,
      body: { project: String(projectA._id), client: cliRes.body.data.id, warrantyMonths: 24 },
    });
    assert.equal(hoRes.status, 201);

    // Dashboard Live Summary
    const dashRes = await app.send('GET', '/dashboard/summary', { as: people.admin });
    assert.equal(dashRes.status, 200);
    assert.equal(dashRes.body.data.portfolio.totalProjects, 1);
    assert.equal(dashRes.body.data.qualitySafety.openNcrs, 1);

    // Reports RBAC + CSV Formula Injection guard (project name starts with '=cmd|...')
    const forbiddenReport = await app.send('GET', '/reports/financial-variance', { as: people.engineer });
    assert.equal(forbiddenReport.status, 403);

    const okReport = await app.send('GET', '/reports/project-progress', { as: people.pmA });
    assert.equal(okReport.status, 200);
    assert.equal(okReport.body.data.rows.length, 1);

    const csvRes = await app.send('GET', '/reports/project-progress/export', { as: people.pmA });
    assert.equal(csvRes.status, 200);
    // Notice CSV neutralizes '=cmd|...' with leading single quote -> "'=cmd|..."
    assert.match(csvRes.text, /'=cmd\|Metro Phase 1/);
  });
});
