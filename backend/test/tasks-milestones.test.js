import './setup-db-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Milestone } from '../src/models/Milestone.js';
import { Project } from '../src/models/Project.js';
import { Task } from '../src/models/Task.js';
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
    code: 'PRJ-TSK-A',
    name: 'Task Test Project A',
    status: 'active',
  });

  projectB = await Project.create({
    code: 'PRJ-TSK-B',
    name: 'Task Test Project B',
    status: 'active',
  });

  // Assign pm and engineer to projectA; otherEngineer to projectB
  await User.updateOne({ _id: people.pm.id }, { $addToSet: { assignedProjects: projectA._id } });
  await User.updateOne({ _id: people.engineer.id }, { $addToSet: { assignedProjects: projectA._id } });
  await User.updateOne({ _id: people.otherEngineer.id }, { $addToSet: { assignedProjects: projectB._id } });
});

after(() => app.stop());

describe('Milestones Management', () => {
  let milestoneId;

  it('Project Manager creates a milestone for assigned project', async () => {
    const res = await app.send('POST', '/projects/milestones', {
      as: people.pm,
      body: {
        title: 'Foundation Completion',
        project: String(projectA._id),
        targetDate: '2027-03-31',
        description: 'Complete excavation and foundation casting',
        deliverables: ['PCC', 'Raft slab inspection', 'Soil testing report'],
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.title, 'Foundation Completion');
    assert.equal(res.body.data.status, 'pending');
    assert.equal(res.body.data.deliverables.length, 3);
    milestoneId = res.body.data.id;
  });

  it('Cannot create a milestone for a project the user cannot access', async () => {
    const res = await app.send('POST', '/projects/milestones', {
      as: people.otherEngineer,
      body: {
        title: 'Unauthorized Milestone',
        project: String(projectA._id),
        targetDate: '2027-04-15',
      },
    });
    assert.equal(res.status, 403);
  });

  it('Lists milestones scoped to accessible projects', async () => {
    const res1 = await app.send('GET', '/projects/milestones', { as: people.engineer });
    assert.equal(res1.status, 200);
    assert.ok(res1.body.data.some((m) => m.id === milestoneId));

    const res2 = await app.send('GET', '/projects/milestones', { as: people.otherEngineer });
    assert.equal(res2.status, 200);
    assert.ok(!res2.body.data.some((m) => m.id === milestoneId));
  });
});

describe('Tasks Management', () => {
  let milestoneId;
  let taskId;

  before(async () => {
    const m = await Milestone.findOne({ title: 'Foundation Completion' });
    milestoneId = String(m._id);
  });

  it('Creates a task linked to project and milestone', async () => {
    const res = await app.send('POST', '/projects/tasks', {
      as: people.pm,
      body: {
        title: 'Excavate Plot Section 1',
        project: String(projectA._id),
        milestone: milestoneId,
        assignedTo: people.engineer.id,
        priority: 'high',
        dueDate: '2027-01-15',
        description: 'Earth excavation to depth of 4.5m',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.title, 'Excavate Plot Section 1');
    assert.equal(res.body.data.status, 'todo');
    assert.equal(res.body.data.priority, 'high');
    assert.equal(res.body.data.assignedTo.id, people.engineer.id);
    assert.ok(res.body.data.code.startsWith('TSK-PRJ-TSK-A-'));
    taskId = res.body.data.id;
  });

  it('Completing a task automatically updates progressPercent to 100% and sets completedAt', async () => {
    const res = await app.send('PATCH', `/projects/tasks/${taskId}`, {
      as: people.pm,
      body: { status: 'completed' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'completed');
    assert.equal(res.body.data.progressPercent, 100);
    assert.ok(res.body.data.completedAt);
  });

  it('Guard: Cannot delete a milestone that has linked tasks', async () => {
    const res = await app.send('DELETE', `/projects/milestones/${milestoneId}`, {
      as: people.admin,
    });
    assert.equal(res.status, 400);
  });

  it('Deletes task successfully (admin only)', async () => {
    const forbiddenRes = await app.send('DELETE', `/projects/tasks/${taskId}`, {
      as: people.engineer,
    });
    assert.equal(forbiddenRes.status, 403);

    const res = await app.send('DELETE', `/projects/tasks/${taskId}`, {
      as: people.admin,
    });
    assert.equal(res.status, 200);
  });
});
