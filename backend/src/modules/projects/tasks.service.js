import { Milestone, MILESTONE_STATUS } from '../../models/Milestone.js';
import { Project } from '../../models/Project.js';
import { Task, TASK_STATUS } from '../../models/Task.js';
import { User, USER_STATUS } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { paginate, parsePagination } from '../../utils/pagination.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';

const TASK_SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'status', 'progressPercent', 'title'];
const MILESTONE_SORT_FIELDS = ['createdAt', 'targetDate', 'status', 'progressPercent', 'title'];
const PERSON_FIELDS = 'firstName lastName email designation';
const PROJECT_FIELDS = 'code name';

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
    milestone: task.milestone
      ? {
          id: String(task.milestone._id || task.milestone),
          title: task.milestone.title ?? '',
        }
      : null,
    assignedTo: toPerson(task.assignedTo),
    status: task.status,
    priority: task.priority,
    startDate: task.startDate ?? null,
    dueDate: task.dueDate ?? null,
    completedAt: task.completedAt ?? null,
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
    populate: [
      { path: 'project', select: PROJECT_FIELDS },
      { path: 'milestone', select: 'title' },
      { path: 'assignedTo', select: PERSON_FIELDS },
    ],
  });

  return { items: items.map(toTaskDto), meta };
}

export async function getTaskById(user, id) {
  const task = await Task.findOne(scoped(user, { _id: id }))
    .populate('project', PROJECT_FIELDS)
    .populate('milestone', 'title')
    .populate('assignedTo', PERSON_FIELDS)
    .populate('dependencies', 'code title status');
  if (!task) throw ApiError.notFound('Task not found');
  return toTaskDto(task);
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

  let code = input.code;
  if (!code) {
    const count = await Task.countDocuments({ project: project._id });
    code = `TSK-${project.code}-${String(count + 1).padStart(3, '0')}`;
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

  await task.populate([
    { path: 'project', select: PROJECT_FIELDS },
    { path: 'milestone', select: 'title' },
    { path: 'assignedTo', select: PERSON_FIELDS },
  ]);

  return toTaskDto(task);
}

export async function updateTask(user, id, input) {
  const task = await Task.findOne(scoped(user, { _id: id }));
  if (!task) throw ApiError.notFound('Task not found');

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

  Object.assign(task, input);

  if (input.status === TASK_STATUS.COMPLETED) {
    task.completedAt = task.completedAt || new Date();
    task.progressPercent = 100;
  } else if (input.status && input.status !== TASK_STATUS.COMPLETED) {
    task.completedAt = undefined;
  }

  task.updatedBy = user._id;
  await task.save();

  await task.populate([
    { path: 'project', select: PROJECT_FIELDS },
    { path: 'milestone', select: 'title' },
    { path: 'assignedTo', select: PERSON_FIELDS },
  ]);

  return toTaskDto(task);
}

export async function deleteTask(user, id) {
  const task = await Task.findOne(scoped(user, { _id: id }));
  if (!task) throw ApiError.notFound('Task not found');

  await Task.findByIdAndDelete(id);
  return { id, code: task.code, project: task.project };
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

