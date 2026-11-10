import './setup-db-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { AuditLog } from '../src/models/AuditLog.js';
import { Project } from '../src/models/Project.js';
import { Site } from '../src/models/Site.js';
import { User } from '../src/models/User.js';
import { startDbApp } from './helpers/dbApp.js';

let app;
const people = {};
let projectA;
let projectB;
let siteA;
let milestoneA;
let taskA;
let taskB;
let taskC;
let taskOtherProject;
let riskId;
let coId;

before(async () => {
  app = await startDbApp();
  people.admin = await app.createUser('ControlAdmin', 'company_admin');
  people.pmA = await app.createUser('ControlPMA', 'project_manager');
  people.pmReviewer = await app.createUser('ControlPMRev', 'project_manager');
  people.pmB = await app.createUser('ControlPMB', 'project_manager');
  people.engineer = await app.createUser('ControlEng', 'site_engineer');

  projectA = await Project.create({
    code: 'PRJ-CTRL-A',
    name: 'Release 1 Control Tower',
    status: 'active',
    contractValue: 5000000,
    startDate: new Date('2026-01-01T00:00:00Z'),
    plannedEndDate: new Date('2026-06-30T00:00:00Z'),
  });
  projectB = await Project.create({
    code: 'PRJ-CTRL-B',
    name: 'Isolated Beta Site',
    status: 'active',
    contractValue: 2000000,
  });

  await User.updateMany(
    { _id: { $in: [people.pmA.id, people.pmReviewer.id, people.engineer.id] } },
    { $addToSet: { assignedProjects: projectA._id } },
  );
  await User.updateOne({ _id: people.pmB.id }, { $addToSet: { assignedProjects: projectB._id } });

  siteA = await Site.create({
    code: 'SITE-CTRL-A',
    name: 'Tower A Podium',
    project: projectA._id,
    status: 'active',
  });

  const msRes = await app.send('POST', '/projects/milestones', {
    as: people.pmA,
    body: {
      project: String(projectA._id),
      title: 'Substructure Complete',
      targetDate: '2026-03-15',
    },
  });
  assert.equal(msRes.status, 201);
  milestoneA = msRes.body.data;

  const otherTaskRes = await app.send('POST', '/projects/tasks', {
    as: people.pmB,
    body: {
      project: String(projectB._id),
      title: 'Beta Mobilization',
    },
  });
  assert.equal(otherTaskRes.status, 201);
  taskOtherProject = otherTaskRes.body.data;
});

after(() => app.stop());

describe('Release 1 – Project Control (WBS, Dependencies, Gantt, Baseline, Risks, Change Orders & Closure)', () => {
  it('creates WBS tasks, computes milestone/project progress rollups, and returns WBS tree', async () => {
    const resA = await app.send('POST', '/projects/tasks', {
      as: people.pmA,
      body: {
        project: String(projectA._id),
        site: String(siteA._id),
        milestone: milestoneA.id,
        title: '1.0 Excavation & Piling',
        wbsCode: '1.0',
        workPackage: 'Substructure',
        startDate: '2026-01-05',
        dueDate: '2026-01-25',
        estimatedHours: 120,
        weightPercent: 60,
        status: 'completed',
        progressPercent: 100,
      },
    });
    assert.equal(resA.status, 201);
    taskA = resA.body.data;

    const resB = await app.send('POST', '/projects/tasks', {
      as: people.pmA,
      body: {
        project: String(projectA._id),
        site: String(siteA._id),
        milestone: milestoneA.id,
        parentTask: taskA.id,
        dependencies: [taskA.id],
        title: '1.1 Pile Cap Concrete',
        wbsCode: '1.1',
        workPackage: 'Substructure',
        startDate: '2026-01-26',
        dueDate: '2026-02-15',
        estimatedHours: 80,
        weightPercent: 40,
        status: 'in_progress',
        progressPercent: 50,
      },
    });
    assert.equal(resB.status, 201);
    taskB = resB.body.data;

    // Weighted rollup: (100*60 + 50*40) / 100 = 80
    const msCheck = await app.send('GET', `/projects/milestones/${milestoneA.id}`, { as: people.pmA });
    assert.equal(msCheck.status, 200);
    assert.equal(msCheck.body.data.progressPercent, 80);

    const wbsRes = await app.send('GET', `/projects/${projectA._id}/wbs`, { as: people.engineer });
    assert.equal(wbsRes.status, 200);
    assert.equal(wbsRes.body.data.tree.length, 1);
    assert.equal(wbsRes.body.data.tree[0].id, taskA.id);
    assert.equal(wbsRes.body.data.tree[0].children.length, 1);
    assert.equal(wbsRes.body.data.tree[0].children[0].id, taskB.id);
    assert.equal(wbsRes.body.data.workPackages[0].workPackage, 'Substructure');
    assert.equal(wbsRes.body.data.workPackages[0].estimatedHours, 200);
  });

  it('rejects cross-project, self, and multi-hop circular task dependencies', async () => {
    // Create task C depending on B (Chain: A -> B -> C)
    const resC = await app.send('POST', '/projects/tasks', {
      as: people.pmA,
      body: {
        project: String(projectA._id),
        milestone: milestoneA.id,
        dependencies: [taskB.id],
        title: '1.2 Ground Beams',
        wbsCode: '1.2',
        workPackage: 'Substructure',
        startDate: '2026-02-16',
        dueDate: '2026-03-05',
      },
    });
    assert.equal(resC.status, 201);
    taskC = resC.body.data;

    // Cross-project dependency rejected
    const crossRes = await app.send('PATCH', `/projects/tasks/${taskC.id}`, {
      as: people.pmA,
      body: { dependencies: [taskOtherProject.id] },
    });
    assert.equal(crossRes.status, 400);

    // Self dependency rejected
    const selfRes = await app.send('PATCH', `/projects/tasks/${taskA.id}`, {
      as: people.pmA,
      body: { dependencies: [taskA.id] },
    });
    assert.equal(selfRes.status, 400);

    // Multi-hop circular dependency A depends on C (C -> B -> A -> C) rejected
    const cycleRes = await app.send('PATCH', `/projects/tasks/${taskA.id}`, {
      as: people.pmA,
      body: { dependencies: [taskC.id] },
    });
    assert.equal(cycleRes.status, 400);
    assert.match(cycleRes.body.error.message, /circular/i);
  });

  it('freezes project baseline, snapshots task baseline dates, blocks non-admin re-baseline, and reports Gantt variance', async () => {
    const freezeRes = await app.send('POST', `/projects/${projectA._id}/baseline`, {
      as: people.pmA,
      body: { notes: 'Initial IFC baseline' },
    });
    assert.equal(freezeRes.status, 200);
    assert.equal(freezeRes.body.data.baseline.contractValue, 5000000);
    assert.ok(freezeRes.body.data.baseline.lockedAt);

    // Duplicate freeze without rebaseline blocked
    const dupRes = await app.send('POST', `/projects/${projectA._id}/baseline`, {
      as: people.pmA,
      body: {},
    });
    assert.equal(dupRes.status, 400);

    // Non-admin rebaseline forbidden
    const pmRebaseline = await app.send('POST', `/projects/${projectA._id}/baseline`, {
      as: people.pmA,
      body: { rebaseline: true },
    });
    assert.equal(pmRebaseline.status, 403);

    // Push taskB dueDate out by 5 days and check Gantt schedule variance
    const shiftRes = await app.send('PATCH', `/projects/tasks/${taskB.id}`, {
      as: people.pmA,
      body: { dueDate: '2026-02-20' },
    });
    assert.equal(shiftRes.status, 200);

    const ganttRes = await app.send('GET', `/projects/${projectA._id}/gantt`, { as: people.engineer });
    assert.equal(ganttRes.status, 200);
    assert.equal(ganttRes.body.data.milestones.length, 1);
    const ganttB = ganttRes.body.data.tasks.find((t) => t.id === taskB.id);
    assert.equal(ganttB.varianceDays, 5);
  });

  it('manages risk register with automatic severity matrix calculation and project isolation', async () => {
    const createRisk = await app.send('POST', `/projects/${projectA._id}/risks`, {
      as: people.pmA,
      body: {
        title: 'Monsoon waterlogging in podium pit',
        category: 'weather',
        probability: 'high',
        impact: 'high',
        mitigationPlan: 'Deploy standby dewatering pumps',
        owner: people.engineer.id,
      },
    });
    assert.equal(createRisk.status, 201);
    assert.equal(createRisk.body.data.severity, 'critical');
    assert.match(createRisk.body.data.riskNumber, /^RSK-/);
    riskId = createRisk.body.data.id;

    // Engineer (read-only on projects) cannot create risks
    const engCreate = await app.send('POST', `/projects/${projectA._id}/risks`, {
      as: people.engineer,
      body: { title: 'Unauthorized Risk' },
    });
    assert.equal(engCreate.status, 403);

    // Unassigned PM B cannot read Project A risks
    const pmBList = await app.send('GET', `/projects/${projectA._id}/risks`, { as: people.pmB });
    assert.equal(pmBList.status, 404);
  });

  it('runs Change Order approval workflow with maker-checker, client signoff check, and updates Project while preserving Baseline', async () => {
    const createCo = await app.send('POST', `/projects/${projectA._id}/change-orders`, {
      as: people.pmA,
      body: {
        title: 'Additional waterproofing membrane layer',
        type: 'scope',
        costImpact: 250000,
        scheduleImpactDays: 10,
        reason: 'Consultant structural revision',
        clientApprovalRequired: true,
      },
    });
    assert.equal(createCo.status, 201);
    assert.match(createCo.body.data.changeNumber, /^CO-/);
    coId = createCo.body.data.id;

    // Submit for approval
    const submitCo = await app.send('POST', `/projects/${projectA._id}/change-orders/${coId}/transition`, {
      as: people.pmA,
      body: { status: 'submitted', comment: 'Submitted for PM review' },
    });
    assert.equal(submitCo.status, 200);
    assert.equal(submitCo.body.data.status, 'submitted');

    // Pending approvals endpoint includes the change order for pmReviewer
    const pendingRes = await app.send('GET', '/notifications/pending-approvals', { as: people.pmReviewer });
    assert.equal(pendingRes.status, 200);
    assert.ok(pendingRes.body.data.some((item) => item.id === coId && item.type === 'Change Order'));

    // Self-approval blocked (maker-checker) even when clientApproved=true
    const selfApprove = await app.send('POST', `/projects/${projectA._id}/change-orders/${coId}/transition`, {
      as: people.pmA,
      body: { status: 'approved', clientApproved: true },
    });
    assert.equal(selfApprove.status, 403);

    // Approval without client signoff confirmation fails
    const noClientSignoff = await app.send('POST', `/projects/${projectA._id}/change-orders/${coId}/transition`, {
      as: people.pmReviewer,
      body: { status: 'approved', clientApproved: false },
    });
    assert.equal(noClientSignoff.status, 400);

    // Reviewer approves with clientApproved=true
    const approveCo = await app.send('POST', `/projects/${projectA._id}/change-orders/${coId}/transition`, {
      as: people.pmReviewer,
      body: { status: 'approved', clientApproved: true, comment: 'Approved by consultant & PM reviewer' },
    });
    assert.equal(approveCo.status, 200);
    assert.equal(approveCo.body.data.status, 'approved');
    assert.ok(approveCo.body.data.appliedAt);

    // Verify Project contractValue increased to 5,250,000 and plannedEndDate shifted +10d, while Baseline stayed 5,000,000
    const projRes = await app.send('GET', `/projects/${projectA._id}`, { as: people.pmA });
    assert.equal(projRes.status, 200);
    assert.equal(projRes.body.data.contractValue, 5250000);
    assert.equal(projRes.body.data.baseline.contractValue, 5000000);
    assert.equal(
      projRes.body.data.plannedEndDate.slice(0, 10),
      '2026-07-10',
    );
    assert.equal(
      projRes.body.data.baseline.plannedEndDate.slice(0, 10),
      '2026-06-30',
    );
  });

  it('enforces readiness & closure gate until blockers and checklist are resolved', async () => {
    const readinessRes = await app.send('GET', `/projects/${projectA._id}/readiness`, { as: people.pmA });
    assert.equal(readinessRes.status, 200);
    assert.equal(readinessRes.body.data.ready, false);
    assert.ok(readinessRes.body.data.metrics.openTasks >= 2);
    assert.equal(readinessRes.body.data.metrics.highOpenRisks, 1);

    // Attempt closure with open blockers fails
    const failClose = await app.send('POST', `/projects/${projectA._id}/close`, {
      as: people.pmA,
      body: {
        closureChecklist: {
          finalInspectionCompleted: true,
          punchListCleared: true,
          asBuiltSubmitted: true,
          finalAccountsSettled: true,
          clientHandoverCompleted: true,
        },
      },
    });
    assert.equal(failClose.status, 400);

    // Non-admin cannot forceClose
    const failForce = await app.send('POST', `/projects/${projectA._id}/close`, {
      as: people.pmA,
      body: { forceClose: true },
    });
    assert.equal(failForce.status, 403);

    // Resolve open tasks, milestone, and critical risk
    await Promise.all([
      app.send('PATCH', `/projects/tasks/${taskB.id}`, {
        as: people.pmA,
        body: { status: 'completed', progressPercent: 100 },
      }),
      app.send('PATCH', `/projects/tasks/${taskC.id}`, {
        as: people.pmA,
        body: { status: 'completed', progressPercent: 100 },
      }),
      app.send('PATCH', `/projects/milestones/${milestoneA.id}`, {
        as: people.pmA,
        body: { status: 'achieved' },
      }),
      app.send('PATCH', `/projects/${projectA._id}/risks/${riskId}`, {
        as: people.pmA,
        body: { status: 'mitigated' },
      }),
    ]);

    const readyNow = await app.send('GET', `/projects/${projectA._id}/readiness`, { as: people.pmA });
    assert.equal(readyNow.status, 200);
    assert.equal(readyNow.body.data.ready, true);

    // Attempt closure missing checklist fails
    const missingChecklist = await app.send('POST', `/projects/${projectA._id}/close`, {
      as: people.pmA,
      body: {
        closureChecklist: {
          finalInspectionCompleted: true,
          punchListCleared: false,
          asBuiltSubmitted: true,
          finalAccountsSettled: true,
          clientHandoverCompleted: true,
        },
      },
    });
    assert.equal(missingChecklist.status, 400);

    // Complete checklist closes project cleanly and logs audit entry
    const closeOk = await app.send('POST', `/projects/${projectA._id}/close`, {
      as: people.pmA,
      body: {
        actualEndDate: '2026-07-08',
        closureChecklist: {
          finalInspectionCompleted: true,
          punchListCleared: true,
          asBuiltSubmitted: true,
          finalAccountsSettled: true,
          clientHandoverCompleted: true,
          warrantyMonths: 24,
          remarks: 'Signed handing-over certificate attached',
        },
      },
    });
    assert.equal(closeOk.status, 200);
    assert.equal(closeOk.body.data.status, 'completed');
    assert.equal(closeOk.body.data.progressPercent, 100);
    assert.equal(closeOk.body.data.closureChecklist.warrantyMonths, 24);

    const auditCount = await AuditLog.countDocuments({
      module: 'projects',
      action: 'project.close',
      entityId: projectA._id,
    });
    assert.equal(auditCount, 1);
  });
});
