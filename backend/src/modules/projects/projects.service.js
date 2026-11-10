import { DATA_SCOPES, ROLES } from '../../config/rbac.js';
import { Project } from '../../models/Project.js';
import { User, USER_STATUS } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { paginate, parsePagination } from '../../utils/pagination.js';
import { buildProjectScope } from '../../utils/scope.js';

export const ELIGIBLE_PM_ROLES = [ROLES.PROJECT_MANAGER, ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN];

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
    baseline: project.baseline?.lockedAt
      ? {
          startDate: project.baseline.startDate ?? null,
          plannedEndDate: project.baseline.plannedEndDate ?? null,
          contractValue: project.baseline.contractValue ?? 0,
          progressPercent: project.baseline.progressPercent ?? 0,
          lockedAt: project.baseline.lockedAt,
          lockedBy: toPerson(project.baseline.lockedBy) || (project.baseline.lockedBy ? String(project.baseline.lockedBy) : null),
          notes: project.baseline.notes ?? '',
        }
      : null,
    closureChecklist: project.closureChecklist
      ? {
          finalInspectionCompleted: Boolean(project.closureChecklist.finalInspectionCompleted),
          punchListCleared: Boolean(project.closureChecklist.punchListCleared),
          asBuiltSubmitted: Boolean(project.closureChecklist.asBuiltSubmitted),
          finalAccountsSettled: Boolean(project.closureChecklist.finalAccountsSettled),
          clientHandoverCompleted: Boolean(project.closureChecklist.clientHandoverCompleted),
          warrantyMonths: project.closureChecklist.warrantyMonths ?? 12,
          remarks: project.closureChecklist.remarks ?? '',
          closedAt: project.closureChecklist.closedAt ?? null,
          closedBy: toPerson(project.closureChecklist.closedBy) || (project.closureChecklist.closedBy ? String(project.closureChecklist.closedBy) : null),
        }
      : null,
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
  let query = Project.findOne(scoped(user, { _id: id }))
    .populate('projectManager', PERSON_FIELDS)
    .populate('baseline.lockedBy', PERSON_FIELDS)
    .populate('closureChecklist.closedBy', PERSON_FIELDS);
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

async function findActiveProjectManager(id, field = 'projectManager') {
  const person = await User.findOne({ _id: id, status: USER_STATUS.ACTIVE })
    .select(`${PERSON_FIELDS} role`)
    .populate('role');
  if (!person) throw ApiError.validation([{ field, message: 'Choose an active user' }]);

  const isEligible =
    ELIGIBLE_PM_ROLES.includes(person.role?.key) ||
    (person.role && typeof person.role.can === 'function' && person.role.can('projects', 'update'));
  if (!isEligible) {
    throw ApiError.validation([{ field, message: 'Designated project manager must have an authorized management role' }]);
  }
  return person;
}

const assignToProject = (userId, projectId) => User.updateOne({ _id: userId }, { $addToSet: { assignedProjects: projectId } });

export async function createProject(user, input) {
  if (input.projectManager) await findActiveProjectManager(input.projectManager, 'projectManager');

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

  if (changes.projectManager) await findActiveProjectManager(changes.projectManager, 'projectManager');

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

export async function addTeamMember(user, projectId, payload) {
  const project = await getAccessibleProject(user, projectId, { lean: true });
  const rawIds = payload.userIds ? payload.userIds : payload.userId ? [payload.userId] : [];
  const targetIds = [...new Set(rawIds.map(String))];

  if (!targetIds.length) {
    throw ApiError.badRequest('Select at least one employee to assign');
  }

  // 1. Verify all target users exist and are active
  const activeMembers = await User.find({ _id: { $in: targetIds }, status: USER_STATUS.ACTIVE })
    .select(`${PERSON_FIELDS} role`)
    .populate('role', 'name key');

  if (activeMembers.length !== targetIds.length) {
    throw ApiError.validation([{ field: 'userId', message: 'Choose active employees only' }]);
  }

  // 2. Prevent duplicate assignments: check who is already assigned
  const alreadyAssigned = await User.find({
    _id: { $in: targetIds },
    assignedProjects: project._id,
  }).select('_id');
  const alreadyAssignedSet = new Set(alreadyAssigned.map((u) => String(u._id)));

  if (targetIds.length === 1 && alreadyAssignedSet.has(targetIds[0])) {
    throw ApiError.badRequest('This employee is already assigned to the project');
  }

  const toAssign = targetIds.filter((id) => !alreadyAssignedSet.has(id));
  if (toAssign.length === 0) {
    throw ApiError.badRequest('All selected employees are already assigned to this project');
  }

  await User.updateMany(
    { _id: { $in: toAssign } },
    { $addToSet: { assignedProjects: project._id } },
  );

  return {
    project,
    member: activeMembers[0],
    assignedCount: toAssign.length,
    alreadyAssignedCount: alreadyAssignedSet.size,
    members: activeMembers,
  };
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
export async function lookupUsers(query = {}) {
  const filter = { status: USER_STATUS.ACTIVE };
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ firstName: pattern }, { lastName: pattern }, { email: pattern }];
  }
  let people = await User.find(filter)
    .select(`${PERSON_FIELDS} role`)
    .populate('role', 'name key')
    .sort({ firstName: 1 })
    .limit(50)
    .lean();

  if (query.forProjectManager === 'true' || query.forProjectManager === true) {
    people = people.filter((p) => {
      const key = p.role?.key;
      return ELIGIBLE_PM_ROLES.includes(key);
    });
  }

  return people.map((person) => ({
    ...toPerson(person),
    role: person.role ? { key: person.role.key, name: person.role.name } : null,
  }));
}
