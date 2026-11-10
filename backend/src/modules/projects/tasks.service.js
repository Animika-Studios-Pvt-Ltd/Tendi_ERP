import { Milestone, MILESTONE_STATUS } from '../../models/Milestone.js';
import { Project } from '../../models/Project.js';
import { Site } from '../../models/Site.js';
import { Task, TASK_STATUS } from '../../models/Task.js';
import { User, USER_STATUS } from '../../models/User.js';
import { nextSequenceNumber } from '../../services/sequence.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { paginate, parsePagination } from '../../utils/pagination.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';

const TASK_SORT_FIELDS = ['createdAt', 'dueDate', 'startDate', 'priority', 'status', 'progressPercent', 'title', 'wbsCode'];
const MILESTONE_SORT_FIELDS = ['createdAt', 'targetDate', 'status', 'progressPercent', 'title'];
const PERSON_FIELDS = 'firstName lastName email designation';
const PROJECT_FIELDS = 'code name';
const TASK_POPULATE = [
  { path: 'project', select: PROJECT_FIELDS },
  { path: 'site', select: 'code name' },
  { path: 'milestone', select: 'title targetDate status' },
  { path: 'parentTask', select: 'code title wbsCode' },
  { path: 'assignedTo', select: PERSON_FIELDS },
  { path: 'dependencies', select: 'code title status dueDate startDate' },
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fullName = (person) => [person?.firstName, person?.lastName].filter(Boolean).join(' ');

function toPerson(person) {
  if (!person?._id) return null;
  return {
    id: String(person._id),
    fullName: fullName(person),
    email: person.email,
    designation: person.designation ?? '',
  };
}

export function toTaskDto(doc) {
  const task = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(task._id),
    code: task.code,
    title: task.title,
    description: task.description ?? '',
    project: task.project
      ? {
          id: String(task.project._id || task.project),
          code: task.project.code ?? '',
          name: task.project.name ?? '',
        }
      : null,
    site: task.site
      ? {
          id: String(task.site._id || task.site),
          code: task.site.code ?? '',
          name: task.site.name ?? '',
        }
      : null,
    milestone: task.milestone
      ? {
          id: String(task.milestone._id || task.milestone),
          title: task.milestone.title ?? '',
        }
      : null,
    parentTask: task.parentTask
      ? {
          id: String(task.parentTask._id || task.parentTask),
          code: task.parentTask.code ?? '',
          title: task.parentTask.title ?? '',
          wbsCode: task.parentTask.wbsCode ?? '',
        }
      : null,
    wbsCode: task.wbsCode ?? '',
    workPackage: task.workPackage ?? '',
    assignedTo: toPerson(task.assignedTo),
    status: task.status,
    priority: task.priority,
    baselineStartDate: task.baselineStartDate ?? null,
    baselineDueDate: task.baselineDueDate ?? null,
    startDate: task.startDate ?? null,
    dueDate: task.dueDate ?? null,
    completedAt: task.completedAt ?? null,
    estimatedHours: task.estimatedHours ?? 0,
    actualHours: task.actualHours ?? 0,
    weightPercent: task.weightPercent ?? 1,
    progressPercent: task.progressPercent ?? 0,
    dependencies: (task.dependencies ?? []).map((d) =>
      typeof d === 'object' && d !== null ? { id: String(d._id), code: d.code, title: d.title, status: d.status } : String(d),
    ),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export function toMilestoneDto(doc) {
  const m = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(m._id),
    project: m.project
      ? {
          id: String(m.project._id || m.project),
          code: m.project.code ?? '',
          name: m.project.name ?? '',
        }
      : null,
    title: m.title,
    description: m.description ?? '',
    targetDate: m.targetDate ?? null,
    actualDate: m.actualDate ?? null,
    status: m.status,
    deliverables: m.deliverables ?? [],
    progressPercent: m.progressPercent ?? 0,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

const scoped = (user, filter) => ({
  $and: [buildProjectScope(user, { projectField: 'project' }), filter],
});

/* =========================================================================
 * TASKS
 * ========================================================================= */

export async function listTasks(user, query = {}) {
  const filter = {};
  if (query.project) filter.project = query.project;
  if (query.milestone) filter.milestone = query.milestone;
  if (query.assignedTo) filter.assignedTo = query.assignedTo;
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ title: pattern }, { code: pattern }, { description: pattern }];
  }

  const pagination = parsePagination(query, { allowedSortFields: TASK_SORT_FIELDS, defaultSort: '-createdAt' });
  const { items, meta } = await paginate(Task, scoped(user, filter), pagination, {
    populate: TASK_POPULATE,
  });

  return { items: items.map(toTaskDto), meta };
}

export async function getTaskById(user, id) {
  const task = await Task.findOne(scoped(user, { _id: id })).populate(TASK_POPULATE);
  if (!task) throw ApiError.notFound('Task not found');
  return toTaskDto(task);
}

/**
 * Validates same-project references and detects circular dependency / parentTask loops.
 */
async function validateTaskLinks(projectId, currentTaskId, input) {
  if (input.site) {
    const site = await Site.findOne({ _id: input.site, project: projectId }).select('_id').lean();
    if (!site) {
      throw ApiError.validation([{ field: 'site', message: 'Selected site does not belong to this project' }]);
    }
  }

  const allTasks = await Task.find({ project: projectId }).select('_id parentTask dependencies').lean();
  const taskMap = new Map(allTasks.map((t) => [String(t._id), t]));

  if (input.parentTask) {
    const parentId = String(input.parentTask);
    if (currentTaskId && parentId === String(currentTaskId)) {
      throw ApiError.badRequest('A task cannot be its own parent');
    }
    if (!taskMap.has(parentId)) {
      throw ApiError.validation([{ field: 'parentTask', message: 'Parent task must belong to the same project' }]);
    }
    // Check parent loop: walk ancestors from parentId
    if (currentTaskId) {
      let cursor = parentId;
      const visited = new Set();
      while (cursor) {
        if (cursor === String(currentTaskId)) {
          throw ApiError.badRequest('Circular WBS parent hierarchy detected');
        }
        if (visited.has(cursor)) break;
        visited.add(cursor);
        const node = taskMap.get(cursor);
        cursor = node?.parentTask ? String(node.parentTask) : null;
      }
    }
  }

  if (Array.isArray(input.dependencies) && input.dependencies.length > 0) {
    const uniqueDeps = [...new Set(input.dependencies.map(String))];
    for (const depId of uniqueDeps) {
      if (currentTaskId && depId === String(currentTaskId)) {
        throw ApiError.badRequest('A task cannot depend on itself');
      }
      if (!taskMap.has(depId)) {
        throw ApiError.validation([
          { field: 'dependencies', message: 'All task dependencies must belong to the same project' },
        ]);
      }
    }

    // DFS cycle detection: if currentTaskId is reachable starting from any depId via existing dependencies, adding depId creates a cycle!
    if (currentTaskId) {
      const target = String(currentTaskId);
      const visited = new Set();
      const stack = [...uniqueDeps];
      while (stack.length > 0) {
        const nodeId = stack.pop();
        if (nodeId === target) {
          throw ApiError.badRequest('Circular task dependency detected');
        }
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);
        const node = taskMap.get(nodeId);
        for (const upstream of node?.dependencies ?? []) {
          stack.push(String(upstream));
        }
      }
    }
  }
}

async function recalculateRollups(projectId, milestoneIds = []) {
  const uniqueMilestones = [...new Set(milestoneIds.filter(Boolean).map(String))];
  for (const mId of uniqueMilestones) {
    const mTasks = await Task.find({ milestone: mId }).select('progressPercent weightPercent status').lean();
    if (mTasks.length > 0) {
      const totalWeight = mTasks.reduce((sum, t) => sum + (t.weightPercent > 0 ? t.weightPercent : 1), 0);
      const weighted = mTasks.reduce(
        (sum, t) => sum + (t.progressPercent ?? 0) * (t.weightPercent > 0 ? t.weightPercent : 1),
        0,
      );
      const avg = Math.round(weighted / totalWeight);
      await Milestone.updateOne({ _id: mId }, { $set: { progressPercent: avg } });
    }
  }

  const pTasks = await Task.find({ project: projectId }).select('progressPercent weightPercent').lean();
  if (pTasks.length > 0) {
    const totalWeight = pTasks.reduce((sum, t) => sum + (t.weightPercent > 0 ? t.weightPercent : 1), 0);
    const weighted = pTasks.reduce(
      (sum, t) => sum + (t.progressPercent ?? 0) * (t.weightPercent > 0 ? t.weightPercent : 1),
      0,
    );
    const avg = Math.round(weighted / totalWeight);
    await Project.updateOne({ _id: projectId }, { $set: { progressPercent: avg } });
  }
}

export async function createTask(user, input) {
  if (!canAccessProject(user, input.project)) {
    throw ApiError.forbidden('You do not have access to this project');
  }

  const project = await Project.findById(input.project);
  if (!project) throw ApiError.notFound('Project not found');

  if (input.assignedTo) {
    const assignee = await User.findOne({ _id: input.assignedTo, status: USER_STATUS.ACTIVE });
    if (!assignee) {
      throw ApiError.validation([{ field: 'assignedTo', message: 'Choose an active user' }]);
    }
  }

  if (input.milestone) {
    const milestone = await Milestone.findOne({ _id: input.milestone, project: project._id });
    if (!milestone) {
      throw ApiError.validation([{ field: 'milestone', message: 'Selected milestone does not belong to this project' }]);
    }
  }

  await validateTaskLinks(project._id, null, input);

  if (input.startDate && input.dueDate && input.dueDate < input.startDate) {
    throw ApiError.validation([{ field: 'dueDate', message: 'Due date must be on or after start date' }]);
  }

  let code = input.code;
  if (!code) {
    code = await nextSequenceNumber('task', {
      scopeKey: String(project._id),
      contextCode: project.code,
      prefixOverride: 'TSK',
      minPadding: 3,
    });
  }

  const completedAt = input.status === TASK_STATUS.COMPLETED ? new Date() : undefined;
  const progressPercent = input.status === TASK_STATUS.COMPLETED ? 100 : (input.progressPercent ?? 0);

  const task = await Task.create({
    ...input,
    code: code.toUpperCase(),
    completedAt,
    progressPercent,
    createdBy: user._id,
    updatedBy: user._id,
  });

  await recalculateRollups(project._id, [task.milestone]);
  await task.populate(TASK_POPULATE);
  return toTaskDto(task);
}

export async function updateTask(user, id, input) {
  const task = await Task.findOne(scoped(user, { _id: id }));
  if (!task) throw ApiError.notFound('Task not found');

  const previousMilestone = task.milestone;

  if (input.assignedTo) {
    const assignee = await User.findOne({ _id: input.assignedTo, status: USER_STATUS.ACTIVE });
    if (!assignee) {
      throw ApiError.validation([{ field: 'assignedTo', message: 'Choose an active user' }]);
    }
  }

  if (input.milestone) {
    const milestone = await Milestone.findOne({ _id: input.milestone, project: task.project });
    if (!milestone) {
      throw ApiError.validation([{ field: 'milestone', message: 'Selected milestone does not belong to this project' }]);
    }
  }

  await validateTaskLinks(task.project, task._id, input);

  const nextStart = input.startDate !== undefined ? input.startDate : task.startDate;
  const nextDue = input.dueDate !== undefined ? input.dueDate : task.dueDate;
  if (nextStart && nextDue && nextDue < nextStart) {
    throw ApiError.validation([{ field: 'dueDate', message: 'Due date must be on or after start date' }]);
  }

  Object.assign(task, input);

  if (input.status === TASK_STATUS.COMPLETED) {
    task.completedAt = task.completedAt || new Date();
    task.progressPercent = 100;
  } else if (input.status && input.status !== TASK_STATUS.COMPLETED) {
    task.completedAt = undefined;
  }

  task.updatedBy = user._id;
  await task.save();

  await recalculateRollups(task.project, [previousMilestone, task.milestone]);
  await task.populate(TASK_POPULATE);
  return toTaskDto(task);
}

export async function deleteTask(user, id) {
  const task = await Task.findOne(scoped(user, { _id: id }));
  if (!task) throw ApiError.notFound('Task not found');

  await Promise.all([
    Task.updateMany({ dependencies: task._id }, { $pull: { dependencies: task._id } }),
    Task.updateMany({ parentTask: task._id }, { $set: { parentTask: task.parentTask || null } }),
    Task.findByIdAndDelete(id),
  ]);
  await recalculateRollups(task.project, [task.milestone]);
  return { id, code: task.code, project: task.project };
}

/* =========================================================================
 * WBS & GANTT SCHEDULE
 * ========================================================================= */

export async function getWbsTree(user, projectId) {
  if (!canAccessProject(user, projectId)) throw ApiError.notFound('Project not found');
  const project = await Project.findById(projectId).lean();
  if (!project) throw ApiError.notFound('Project not found');

  const tasks = await Task.find({ project: project._id })
    .populate(TASK_POPULATE)
    .sort({ wbsCode: 1, startDate: 1, createdAt: 1 });

  const dtos = tasks.map(toTaskDto);
  const byId = new Map(dtos.map((t) => [t.id, { ...t, children: [] }]));
  const roots = [];

  for (const node of byId.values()) {
    const parentId = node.parentTask?.id;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Group summary by workPackage
  const packagesMap = new Map();
  for (const t of dtos) {
    const pkg = t.workPackage || 'Unassigned Package';
    if (!packagesMap.has(pkg)) {
      packagesMap.set(pkg, { workPackage: pkg, taskCount: 0, completedCount: 0, progressSum: 0, estimatedHours: 0 });
    }
    const bucket = packagesMap.get(pkg);
    bucket.taskCount += 1;
    if (t.status === TASK_STATUS.COMPLETED) bucket.completedCount += 1;
    bucket.progressSum += t.progressPercent;
    bucket.estimatedHours += t.estimatedHours;
  }

  const workPackages = Array.from(packagesMap.values()).map((b) => ({
    workPackage: b.workPackage,
    taskCount: b.taskCount,
    completedCount: b.completedCount,
    progressPercent: b.taskCount ? Math.round(b.progressSum / b.taskCount) : 0,
    estimatedHours: b.estimatedHours,
  }));

  return { tree: roots, flat: dtos, workPackages };
}

export async function getGanttSchedule(user, projectId) {
  if (!canAccessProject(user, projectId)) throw ApiError.notFound('Project not found');
  const project = await Project.findById(projectId).lean();
  if (!project) throw ApiError.notFound('Project not found');

  const [tasks, milestones] = await Promise.all([
    Task.find({ project: project._id }).populate(TASK_POPULATE).sort({ startDate: 1, wbsCode: 1, createdAt: 1 }),
    Milestone.find({ project: project._id }).populate('project', PROJECT_FIELDS).sort({ targetDate: 1 }),
  ]);

  const now = new Date();
  const taskItems = tasks.map((t) => {
    const dto = toTaskDto(t);
    const baselineRef = dto.baselineDueDate ? new Date(dto.baselineDueDate) : null;
    const currentEnd = dto.dueDate ? new Date(dto.dueDate) : null;
    const varianceDays =
      baselineRef && currentEnd ? Math.round((currentEnd.getTime() - baselineRef.getTime()) / 86400000) : 0;
    const isDelayed = Boolean(currentEnd && dto.status !== TASK_STATUS.COMPLETED && currentEnd < now);
    return { ...dto, varianceDays, isDelayed };
  });

  const baselineEnd = project.baseline?.plannedEndDate ? new Date(project.baseline.plannedEndDate) : null;
  const currentPlannedEnd = project.plannedEndDate ? new Date(project.plannedEndDate) : null;
  const projectScheduleVarianceDays =
    baselineEnd && currentPlannedEnd ? Math.round((currentPlannedEnd.getTime() - baselineEnd.getTime()) / 86400000) : 0;

  return {
    project: {
      id: String(project._id),
      code: project.code,
      name: project.name,
      startDate: project.startDate ?? null,
      plannedEndDate: project.plannedEndDate ?? null,
      actualEndDate: project.actualEndDate ?? null,
      progressPercent: project.progressPercent ?? 0,
      contractValue: project.contractValue ?? 0,
      baseline: project.baseline?.lockedAt ? project.baseline : null,
      scheduleVarianceDays: projectScheduleVarianceDays,
    },
    tasks: taskItems,
    milestones: milestones.map(toMilestoneDto),
  };
}

/* =========================================================================
 * MILESTONES
 * ========================================================================= */

export async function listMilestones(user, query = {}) {
  const filter = {};
  if (query.project) filter.project = query.project;
  if (query.status) filter.status = query.status;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ title: pattern }, { description: pattern }];
  }

  const pagination = parsePagination(query, { allowedSortFields: MILESTONE_SORT_FIELDS, defaultSort: 'targetDate' });
  const { items, meta } = await paginate(Milestone, scoped(user, filter), pagination, {
    populate: [{ path: 'project', select: PROJECT_FIELDS }],
  });

  return { items: items.map(toMilestoneDto), meta };
}

export async function getMilestoneById(user, id) {
  const milestone = await Milestone.findOne(scoped(user, { _id: id })).populate('project', PROJECT_FIELDS);
  if (!milestone) throw ApiError.notFound('Milestone not found');
  return toMilestoneDto(milestone);
}

export async function createMilestone(user, input) {
  if (!canAccessProject(user, input.project)) {
    throw ApiError.forbidden('You do not have access to this project');
  }

  const project = await Project.findById(input.project);
  if (!project) throw ApiError.notFound('Project not found');

  const milestone = await Milestone.create({
    ...input,
    targetDate: new Date(input.targetDate),
    actualDate: input.status === MILESTONE_STATUS.ACHIEVED ? (input.actualDate || new Date()) : input.actualDate,
    progressPercent: input.status === MILESTONE_STATUS.ACHIEVED ? 100 : (input.progressPercent ?? 0),
    createdBy: user._id,
    updatedBy: user._id,
  });

  await milestone.populate('project', PROJECT_FIELDS);
  return toMilestoneDto(milestone);
}

export async function updateMilestone(user, id, input) {
  const milestone = await Milestone.findOne(scoped(user, { _id: id }));
  if (!milestone) throw ApiError.notFound('Milestone not found');

  Object.assign(milestone, input);

  if (input.status === MILESTONE_STATUS.ACHIEVED) {
    milestone.actualDate = milestone.actualDate || new Date();
    milestone.progressPercent = 100;
  }

  milestone.updatedBy = user._id;
  await milestone.save();

  await milestone.populate('project', PROJECT_FIELDS);
  return toMilestoneDto(milestone);
}

export async function deleteMilestone(user, id) {
  const milestone = await Milestone.findOne(scoped(user, { _id: id }));
  if (!milestone) throw ApiError.notFound('Milestone not found');

  const linkedTasks = await Task.countDocuments({ milestone: milestone._id });
  if (linkedTasks > 0) {
    throw ApiError.badRequest(`Cannot delete milestone with ${linkedTasks} linked tasks. Reassign or remove tasks first.`);
  }

  await Milestone.findByIdAndDelete(id);
  return { id, title: milestone.title, project: milestone.project };
}

