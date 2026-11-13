import './setup-db-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Material } from '../src/models/Material.js';
import { Project } from '../src/models/Project.js';
import { User } from '../src/models/User.js';
import { Vendor } from '../src/models/Vendor.js';
import { startDbApp } from './helpers/dbApp.js';

let app;
const people = {};
let materialA;
let vendorA;
let vendorB;
let rateAnalysisId;
let estimateId;
let revisionId;
let boqItemId;
let convertedProjectId;
let tenderId;

before(async () => {
  app = await startDbApp();
  people.admin = await app.createUser('EstAdmin', 'company_admin');
  people.pmA = await app.createUser('EstPMA', 'project_manager');
  people.pmReviewer = await app.createUser('EstPMRev', 'project_manager');
  people.engineer = await app.createUser('EstEng', 'site_engineer');

  materialA = await Material.create({
    code: 'MAT-EST-1',
    name: 'M25 Ready Mix Concrete',
    category: 'Cement & Concrete',
    unit: 'cu.m',
    standardRate: 5200,
  });

  vendorA = await Vendor.create({ code: 'VND-EST-A', name: 'Apex Piling Contractors' });
  vendorB = await Vendor.create({ code: 'VND-EST-B', name: 'Zenith Foundation Works' });
});

after(() => app.stop());

describe('Release 2 – Preconstruction & Estimation (Rate Analysis, BOQ, Revisions, Approval, Conversion & Tenders)', () => {
  it('builds a composite Rate Analysis linking Material standardRate, labour, equipment & overhead', async () => {
    const res = await app.send('POST', '/estimation/rate-analyses', {
      as: people.pmA,
      body: {
        name: 'RCC M25 Footing Concrete',
        costHead: 'Substructure & Excavation',
        unit: 'cu.m',
        materialComponents: [
          { material: String(materialA._id), description: 'M25 RMC', qtyPerUnit: 1.02 },
        ],
        labourComponents: [
          { trade: 'Mason & Helper Crew', unit: 'days', qtyPerUnit: 0.5, rate: 1000 },
        ],
        equipmentComponents: [
          { equipmentName: 'Concrete Pump', unit: 'hours', qtyPerUnit: 0.25, rate: 800 },
        ],
        overheadPercent: 10,
      },
    });
    assert.equal(res.status, 201);
    assert.match(res.body.data.code, /^RA-/);
    // Material: 1.02 * 5200 = 5304; Labour: 500; Equipment: 200 -> Direct = 6004; +10% OH = 6604.4
    assert.equal(res.body.data.materialUnitCost, 5304);
    assert.equal(res.body.data.labourUnitCost, 500);
    assert.equal(res.body.data.equipmentUnitCost, 200);
    assert.equal(res.body.data.directRate, 6004);
    assert.equal(res.body.data.compositeRate, 6604.4);
    rateAnalysisId = res.body.data.id;

    // Read-only role cannot create rate analysis
    const engTry = await app.send('POST', '/estimation/rate-analyses', {
      as: people.engineer,
      body: { name: 'Unauthorized', unit: 'nos' },
    });
    assert.equal(engTry.status, 403);
  });

  it('creates an Estimate, computes BOQ L×B×H takeoff & RateAnalysis pricing, and rolls commercial totals', async () => {
    const estRes = await app.send('POST', '/estimation/estimates', {
      as: people.pmA,
      body: {
        title: 'Commercial Annex Phase 1',
        enquiryCode: 'ENQ-2026-09',
        client: { name: 'Skyline Developers', contactPerson: 'R. Mehta', phone: '9820012345' },
        location: { city: 'Pune', state: 'Maharashtra' },
        overheadPercent: 10,
        contingencyPercent: 5,
        profitMarginPercent: 10,
        gstPercent: 18,
      },
    });
    assert.equal(estRes.status, 201);
    assert.match(estRes.body.data.estimateNumber, /^EST-/);
    estimateId = estRes.body.data.id;

    // Add BOQ item using L=10, W=2, H=0.5, multiplier=5 => qty = 50 cu.m, linked to rateAnalysisId (direct sum 6004/unit)
    const boqRes = await app.send('POST', `/estimation/estimates/${estimateId}/boq-items`, {
      as: people.pmA,
      body: {
        wbsCode: '1.1',
        workPackage: 'Substructure PCC/RCC',
        costHead: 'Substructure & Excavation',
        description: 'Isolated Footing RCC M25',
        unit: 'cu.m',
        takeoff: { length: 10, width: 2, height: 0.5, multiplier: 5 },
        rateAnalysis: rateAnalysisId,
      },
    });
    assert.equal(boqRes.status, 201);
    assert.equal(boqRes.body.data.quantity, 50);
    assert.equal(boqRes.body.data.unitRate, 6004);
    assert.equal(boqRes.body.data.amount, 300200);
    boqItemId = boqRes.body.data.id;

    // Add direct subcontractor lump-sum BOQ item
    const boq2 = await app.send('POST', `/estimation/estimates/${estimateId}/boq-items`, {
      as: people.pmA,
      body: {
        wbsCode: '1.2',
        workPackage: 'Dewatering & Shoring',
        costHead: 'Site Overheads',
        description: 'Well-point dewatering setup',
        unit: 'days',
        quantity: 20,
        subcontractorRate: 5000,
      },
    });
    assert.equal(boq2.status, 201);
    assert.equal(boq2.body.data.amount, 100000);

    // Check Estimate commercial rollups: Direct = 400,200; OH(10%)=40,020; Cont(5%)=20,010 -> Base=460,230; Margin(10%)=46,023 -> SubTotal=506,253; GST(18%)=91,125.54 -> Quoted=597,378.54
    const getRes = await app.send('GET', `/estimation/estimates/${estimateId}`, { as: people.pmA });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.boqSummary.itemCount, 2);
    assert.equal(getRes.body.data.boqSummary.directCost, 400200);
    assert.equal(getRes.body.data.subTotalBeforeTax, 506253);
    assert.equal(getRes.body.data.quotedTotal, 597378.54);
  });

  it('enforces approval workflow with maker-checker, locks approved estimate, and supports v2 revision cloning', async () => {
    // Submit as pmA
    const subRes = await app.send('POST', `/estimation/estimates/${estimateId}/transition`, {
      as: people.pmA,
      body: { status: 'submitted', comment: 'Ready for commercial approval' },
    });
    assert.equal(subRes.status, 200);

    // Pending approvals includes Estimate for pmReviewer
    const pendRes = await app.send('GET', '/notifications/pending-approvals', { as: people.pmReviewer });
    assert.equal(pendRes.status, 200);
    assert.ok(pendRes.body.data.some((item) => item.id === estimateId && item.type === 'Estimate'));

    // Self-approval blocked for pmA
    const selfApp = await app.send('POST', `/estimation/estimates/${estimateId}/transition`, {
      as: people.pmA,
      body: { status: 'approved' },
    });
    assert.equal(selfApp.status, 403);

    // Approve as pmReviewer
    const appRes = await app.send('POST', `/estimation/estimates/${estimateId}/transition`, {
      as: people.pmReviewer,
      body: { status: 'approved', comment: 'Commercial rates verified' },
    });
    assert.equal(appRes.status, 200);
    assert.equal(appRes.body.data.status, 'approved');

    // Editing approved BOQ is blocked
    const lockedEdit = await app.send('PATCH', `/estimation/estimates/${estimateId}/boq-items/${boqItemId}`, {
      as: people.pmA,
      body: { quantity: 99 },
    });
    assert.equal(lockedEdit.status, 400);

    // Create Revision v2 (clones BOQs into draft)
    const revRes = await app.send('POST', `/estimation/estimates/${estimateId}/revise`, {
      as: people.pmA,
      body: { revisionNotes: 'Client value-engineering option' },
    });
    assert.equal(revRes.status, 201);
    assert.equal(revRes.body.data.version, 2);
    assert.equal(revRes.body.data.status, 'draft');
    assert.equal(revRes.body.data.boqItems.length, 2);
    revisionId = revRes.body.data.id;
  });

  it('converts approved Estimate into Project + Baseline + WBS Tasks and tracks Budget vs Commitment vs Actual', async () => {
    // Draft revision cannot convert
    const failConv = await app.send('POST', `/estimation/estimates/${revisionId}/convert-to-project`, {
      as: people.pmReviewer,
      body: {},
    });
    assert.equal(failConv.status, 400);

    // Convert approved v1 Estimate -> Project + Baseline + WBS tasks
    const convRes = await app.send('POST', `/estimation/estimates/${estimateId}/convert-to-project`, {
      as: people.pmReviewer,
      body: {
        projectName: 'Skyline Annex Tower',
        projectManager: people.pmA.id,
        startDate: '2026-04-01',
        plannedEndDate: '2026-10-31',
        freezeBaseline: true,
        createWbsTasks: true,
      },
    });
    assert.equal(convRes.status, 201);
    assert.match(convRes.body.data.project.code, /^PRJ-/);
    assert.equal(convRes.body.data.project.contractValue, 597378.54);
    assert.equal(convRes.body.data.project.baseline.contractValue, 597378.54);
    convertedProjectId = convRes.body.data.project.id;

    // Duplicate conversion blocked
    const dupConv = await app.send('POST', `/estimation/estimates/${estimateId}/convert-to-project`, {
      as: people.pmReviewer,
      body: {},
    });
    assert.equal(dupConv.status, 400);

    // Verify WBS tasks created cleanly on converted project
    const wbsRes = await app.send('GET', `/projects/${convertedProjectId}/wbs`, { as: people.pmA });
    assert.equal(wbsRes.status, 200);
    assert.equal(wbsRes.body.data.flat.length, 2);

    // Raise & submit a Purchase Order on converted project to test Budget vs Commitment vs Actual analysis
    const poRes = await app.send('POST', '/procurement/purchase-orders', {
      as: people.admin,
      body: {
        project: convertedProjectId,
        vendor: String(vendorA._id),
        items: [{ material: String(materialA._id), quantity: 10, unit: 'cu.m', unitRate: 5200, taxPercent: 18 }],
      },
    });
    assert.equal(poRes.status, 201);
    const submitPo = await app.send('POST', `/procurement/purchase-orders/${poRes.body.data.id}/transition`, {
      as: people.admin,
      body: { status: 'submitted' },
    });
    assert.equal(submitPo.status, 200);

    const budgetRes = await app.send('GET', `/estimation/estimates/${estimateId}/budget-analysis`, { as: people.pmA });
    assert.equal(budgetRes.status, 200);
    assert.equal(budgetRes.body.data.totals.directBaseline, 400200);
    assert.equal(budgetRes.body.data.totals.committedPoTotal, 61360);
    assert.equal(budgetRes.body.data.costHeads.length, 2);
  });

  it('manages Tender creation, multi-bidder quotes, Bid Comparison, and Award', async () => {
    const tRes = await app.send('POST', '/estimation/tenders', {
      as: people.pmA,
      body: {
        title: 'Piling & Dewatering Subcontract Package',
        estimate: estimateId,
        project: convertedProjectId,
        tenderType: 'subcontractor_package',
      },
    });
    assert.equal(tRes.status, 201);
    assert.match(tRes.body.data.tenderNumber, /^TND-/);
    assert.equal(tRes.body.data.estimatedValue, 597378.54);
    tenderId = tRes.body.data.id;

    const b1 = await app.send('POST', `/estimation/tenders/${tenderId}/bids`, {
      as: people.pmA,
      body: {
        bidderName: vendorA.name,
        vendorRef: String(vendorA._id),
        quotedAmount: 520000,
        technicalScore: 88,
        completionDays: 45,
      },
    });
    assert.equal(b1.status, 201);

    const b2 = await app.send('POST', `/estimation/tenders/${tenderId}/bids`, {
      as: people.pmA,
      body: {
        bidderName: vendorB.name,
        vendorRef: String(vendorB._id),
        quotedAmount: 485000,
        technicalScore: 84,
        completionDays: 50,
      },
    });
    assert.equal(b2.status, 201);
    assert.equal(b2.body.data.lowestBidAmount, 485000);
    const winningBidId = b2.body.data.bids[1].id;

    // Engineer cannot award tender
    const engAward = await app.send('POST', `/estimation/tenders/${tenderId}/award`, {
      as: people.engineer,
      body: { bidId: winningBidId },
    });
    assert.equal(engAward.status, 403);

    const awardRes = await app.send('POST', `/estimation/tenders/${tenderId}/award`, {
      as: people.pmReviewer,
      body: { bidId: winningBidId, comment: 'L1 lowest compliant commercial bidder' },
    });
    assert.equal(awardRes.status, 200);
    assert.equal(awardRes.body.data.status, 'awarded');
    assert.equal(awardRes.body.data.awardedBidId, winningBidId);
    assert.equal(awardRes.body.data.bids.find((b) => b.id === winningBidId).status, 'awarded');
    assert.equal(awardRes.body.data.bids.find((b) => b.id !== winningBidId).status, 'rejected');

    // Global Search surfaces Estimate & Tender to permitted user
    const searchRes = await app.send('GET', '/search?q=Skyline', { as: people.pmA });
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.body.data.some((r) => r.type === 'Estimate'));
  });
});
