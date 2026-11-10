import './setup-db-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { DailyProgressReport } from '../src/models/DailyProgressReport.js';
import { Project } from '../src/models/Project.js';
import { Site } from '../src/models/Site.js';
import { User } from '../src/models/User.js';
import { startDbApp } from './helpers/dbApp.js';

let app;
const people = {};
let projectA;
let projectB;

before(async () => {
  app = await startDbApp();
  people.admin = await app.createUser('Admin', 'company_admin');
  people.pm = await app.createUser('Pradeep', 'project_manager');
  people.engineer = await app.createUser('Sanjay', 'site_engineer');
  people.otherEngineer = await app.createUser('Other', 'site_engineer');

  projectA = await Project.create({
    code: 'PRJ-SIT-A',
    name: 'North Site Project',
    status: 'active',
  });

  projectB = await Project.create({
    code: 'PRJ-SIT-B',
    name: 'South Site Project',
    status: 'active',
  });

  // Assign pm and engineer to projectA; otherEngineer to projectB
  await User.updateOne({ _id: people.pm.id }, { $addToSet: { assignedProjects: projectA._id } });
  await User.updateOne({ _id: people.engineer.id }, { $addToSet: { assignedProjects: projectA._id } });
  await User.updateOne({ _id: people.otherEngineer.id }, { $addToSet: { assignedProjects: projectB._id } });
});

after(() => app.stop());

describe('Site Management - CRUD & Project Scoping', () => {
  let createdSiteId;

  it('Engineer creates a site for assigned project', async () => {
    const res = await app.send('POST', '/sites', {
      as: people.engineer,
      body: {
        code: 'SITE-01-A',
        name: 'Block A Foundation',
        project: String(projectA._id),
        location: { city: 'Bengaluru', state: 'Karnataka' },
        siteEngineer: people.engineer.id,
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.code, 'SITE-01-A');
    assert.equal(res.body.data.project.id, String(projectA._id));
    assert.equal(res.body.data.siteEngineer.id, people.engineer.id);
    createdSiteId = res.body.data.id;
  });

  it('Cannot create a site for a project the user is not assigned to (403 forbidden)', async () => {
    const res = await app.send('POST', '/sites', {
      as: people.otherEngineer,
      body: {
        code: 'SITE-02-A',
        name: 'Block B',
        project: String(projectA._id),
      },
    });
    assert.equal(res.status, 403);
  });

  it('Scoped list: engineer sees site in projectA, but not otherEngineer', async () => {
    const res1 = await app.send('GET', '/sites', { as: people.engineer });
    assert.equal(res1.status, 200);
    const codes1 = res1.body.data.map((s) => s.code);
    assert.ok(codes1.includes('SITE-01-A'));

    const res2 = await app.send('GET', '/sites', { as: people.otherEngineer });
    assert.equal(res2.status, 200);
    const codes2 = res2.body.data.map((s) => s.code);
    assert.ok(!codes2.includes('SITE-01-A'));
  });

  it('Updates site details', async () => {
    const res = await app.send('PATCH', `/sites/${createdSiteId}`, {
      as: people.engineer,
      body: { name: 'Block A Foundation & Basement' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.name, 'Block A Foundation & Basement');
  });
});

describe('Daily Progress Reports (DPR) - Workflow & Approvals', () => {
  let siteId;
  let dprId;

  before(async () => {
    const site = await Site.findOne({ code: 'SITE-01-A' });
    siteId = String(site._id);
  });

  it('Site engineer creates a DPR in draft status', async () => {
    const res = await app.send('POST', '/sites/dpr', {
      as: people.engineer,
      body: {
        project: String(projectA._id),
        site: siteId,
        reportDate: '2026-11-10',
        weather: { condition: 'sunny', temperature: 29, weatherImpact: 'none' },
        workDone: [
          { description: 'PCC casting for Column C1 to C8', quantity: 45, unit: 'cu.m', status: 'completed' },
        ],
        labourAttendance: [
          { trade: 'Masons', headcount: 6, hoursWorked: 8 },
          { trade: 'Helpers', headcount: 14, hoursWorked: 8 },
        ],
        materialUsage: [
          { materialName: 'Cement PPC', quantity: 120, unit: 'bags' },
        ],
        remarks: 'Work progressed smoothly as scheduled.',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.status, 'draft');
    assert.ok(res.body.data.reportNumber.startsWith('DPR-PRJ-SIT-A-'));
    assert.equal(res.body.data.workDone.length, 1);
    assert.equal(res.body.data.labourAttendance.length, 2);
    dprId = res.body.data.id;
  });

  it('Submits DPR for review (draft -> submitted)', async () => {
    const res = await app.send('POST', `/sites/dpr/${dprId}/transition`, {
      as: people.engineer,
      body: { status: 'submitted' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'submitted');
    assert.equal(res.body.data.submittedBy.id, people.engineer.id);
  });

  it('Project Manager approves DPR (submitted -> approved)', async () => {
    const res = await app.send('POST', `/sites/dpr/${dprId}/transition`, {
      as: people.pm,
      body: { status: 'approved', comment: 'Quality verified on site visit.' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'approved');
    assert.equal(res.body.data.decidedBy.id, people.pm.id);
    assert.equal(res.body.data.decisionComment, 'Quality verified on site visit.');
  });

  it('Cannot edit an approved DPR', async () => {
    const res = await app.send('PATCH', `/sites/dpr/${dprId}`, {
      as: people.engineer,
      body: { remarks: 'Trying to change after approval' },
    });
    assert.equal(res.status, 400);
  });

  it('Guard: Cannot delete a site that has recorded DPRs', async () => {
    const res = await app.send('DELETE', `/sites/${siteId}`, {
      as: people.admin,
    });
    assert.equal(res.status, 400);
  });
});

