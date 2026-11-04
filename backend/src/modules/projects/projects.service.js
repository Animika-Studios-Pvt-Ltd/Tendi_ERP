import { DATA_SCOPES } from '../../config/rbac.js';
import { Project } from '../../models/Project.js';
import { User, USER_STATUS } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { paginate, parsePagination } from '../../utils/pagination.js';
import { buildProjectScope } from '../../utils/scope.js';

const SORT_FIELDS = ['createdAt', 'name', 'code', 'startDate', 'plannedEndDate', 'contractValue', 'status'];
const PERSON_FIELDS = 'firstName lastName email designation';

const notFound = () => ApiError.notFound('Project not found');
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fullName = (person) => [person?.firstName, person?.lastName].filter(Boolean).join(' ');

function toPerson(person) {
  if (!person?._id) return null;
  return { id: String(person._id), fullName: fullName(person), email: person.email, designation: person.designation ?? '' };
}

export function toProjectDto(doc) {
  const project = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(project._id),
    code: project.code,
    name: project.name,
    description: project.description ?? '',
    status: project.status,
    client: { name: '', contactPerson: '', phone: '', ...project.client },
    location: { address: '', city: '', state: '', pincode: '', ...project.location },
    contractValue: project.contractValue ?? 0,
    startDate: project.startDate ?? null,
    plannedEndDate: project.plannedEndDate ?? null,
    actualEndDate: project.actualEndDate ?? null,
    progressPercent: project.progressPercent ?? 0,
    projectManager: toPerson(project.projectManager),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** Scope is combined with $and so it can never be overridden by another _id condition. */
const scoped = (user, filter) => ({ $and: [buildProjectScope(user, { projectField: '_id' }), filter] });

export async function listProjects(user, query) {
  const conditions = {};
  if (query.status) conditions.status = query.status;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    conditions.$or = [{ name: pattern }, { code: pattern }, { 'client.name': pattern }, { 'location.city': pattern }];
  }
  const pagination = parsePagination(query, { allowedSortFields: SORT_FIELDS, defaultSort: '-createdAt' });
  const { items, meta } = await paginate(Project, scoped(user, conditions), pagination, {
    populate: { path: 'projectManager', select: PERSON_FIELDS },
  });
  return { items: items.map(toProjectDto), meta };
}

/** Out-of-scope and missing projects are indistinguishable (404). */
export async function getAccessibleProject(user, id, { lean = false } = {}) {
  let query = Project.findOne(scoped(user, { _id: id })).populate('projectManager', PERSON_FIELDS);
  if (lean) query = query.lean();
  const project = await query;
  if (!project) throw notFound();
  return project;
}

async function findActiveUser(id, field) {
  const person = await User.findOne({ _id: id, status: USER_STATUS.ACTIVE }).select(PERSON_FIELDS);
  if (!person) throw ApiError.validation([{ field, message: 'Choose an active user' }]);
  return person;
}

const assignToProject = (userId, projectId) => User.updateOne({ _id: userId }, { $addToSet: { assignedProjects: projectId } });

export async function createProject(user, input) {
  if (input.projectManager) await findActiveUser(input.projectManager, 'projectManager');

  const project = await Project.create({ ...input, createdBy: user._id, updatedBy: user._id });

  // Without this, a creator limited to assigned projects could not see what they just created.
  const members = new Set();
  if (user.role.dataScope !== DATA_SCOPES.ALL) members.add(String(user._id));
  if (input.projectManager) members.add(String(input.projectManager));
  await Promise.all([...members].map((memberId) => assignToProject(memberId, project._id)));

  await project.populate('projectManager', PERSON_FIELDS);
  return project;
}

const NESTED = ['client', 'location'];

export async function updateProject(user, id, changes) {
  const project = await getAccessibleProject(user, id);
  const previousManager = project.projectManager?._id ? String(project.projectManager._id) : null;

  if (changes.projectManager) await findActiveUser(changes.projectManager, 'projectManager');

  const start = changes.startDate !== undefined ? changes.startDate : project.startDate;
  const plannedEnd = changes.plannedEndDate !== undefined ? changes.plannedEndDate : project.plannedEndDate;
  const actualEnd = changes.actualEndDate !== undefined ? changes.actualEndDate : project.actualEndDate;
  const dateIssues = [];
  if (start && plannedEnd && plannedEnd < start) {
    dateIssues.push({ field: 'plannedEndDate', message: 'Planned end must be on or after the start date' });
  }
  if (start && actualEnd && actualEnd < start) {
    dateIssues.push({ field: 'actualEndDate', message: 'Actual end must be on or after the start date' });
  }
  if (dateIssues.length) throw ApiError.validation(dateIssues);

  for (const [key, value] of Object.entries(changes)) {
    if (NESTED.includes(key)) {
      for (const [subKey, subValue] of Object.entries(value)) project.set(`${key}.${subKey}`, subValue);
    } else {
      project.set(key, value);
    }
  }
  project.updatedBy = user._id;
  await project.save();

  if (changes.projectManager && changes.projectManager !== previousManager) {
    await assignToProject(changes.projectManager, project._id);
  }
  await project.populate('projectManager', PERSON_FIELDS);
  return project;
}

export async function listTeam(user, projectId) {
  const project = await getAccessibleProject(user, projectId, { lean: true });
  const members = await User.find({ assignedProjects: project._id })
    .select(`${PERSON_FIELDS} status role`)
    .populate('role', 'name key')
    .sort({ firstName: 1, lastName: 1 })
    .lean();
  const managerId = project.projectManager?._id ? String(project.projectManager._id) : null;
  return members.map((member) => ({
    ...toPerson(member),
    status: member.status,
    role: member.role ? { key: member.role.key, name: member.role.name } : null,
    isProjectManager: String(member._id) === managerId,
  }));
}

export async function addTeamMember(user, projectId, memberId) {
  const project = await getAccessibleProject(user, projectId, { lean: true });
  const member = await findActiveUser(memberId, 'userId');
  await assignToProject(member._id, project._id);
  return { project, member };
}

export async function removeTeamMember(user, projectId, memberId) {
  const project = await getAccessibleProject(user, projectId, { lean: true });
  if (project.projectManager?._id && String(project.projectManager._id) === String(memberId)) {
    throw ApiError.badRequest('This person is the project manager. Assign another project manager first.');
  }
  const result = await User.updateOne({ _id: memberId, assignedProjects: project._id }, { $pull: { assignedProjects: project._id } });
  if (result.matchedCount === 0) throw ApiError.notFound('This person is not on the project team');
  return { project };
}

/** Active users to pick as team members or project manager. Minimal fields only. */
export async function lookupUsers(query) {
  const filter = { status: USER_STATUS.ACTIVE };
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ firstName: pattern }, { lastName: pattern }, { email: pattern }];
  }
  const people = await User.find(filter).select(`${PERSON_FIELDS} role`).populate('role', 'name key').sort({ firstName: 1 }).limit(20).lean();
  return people.map((person) => ({ ...toPerson(person), role: person.role ? { key: person.role.key, name: person.role.name } : null }));
}
