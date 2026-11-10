import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { DailyProgressReport } from '../../models/DailyProgressReport.js';
import { Project } from '../../models/Project.js';
import { Site, SITE_STATUS } from '../../models/Site.js';
import { User, USER_STATUS } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { paginate, parsePagination } from '../../utils/pagination.js';
import { buildProjectScope, canAccessProject } from '../../utils/scope.js';

const SITE_SORT_FIELDS = ['createdAt', 'name', 'code', 'status', 'startDate'];
const DPR_SORT_FIELDS = ['createdAt', 'reportDate', 'reportNumber', 'status'];
const PERSON_SELECT = 'firstName lastName email designation';
const PROJECT_SELECT = 'code name';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fullName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ');

function toPerson(person) {
  if (!person?._id) return null;
  return {
    id: String(person._id),
    fullName: fullName(person),
    email: person.email,
    designation: person.designation ?? '',
  };
}

export function toSiteDto(doc) {
  const site = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(site._id),
    code: site.code,
    name: site.name,
    description: site.description ?? '',
    status: site.status,
    project: site.project
      ? {
          id: String(site.project._id || site.project),
          code: site.project.code ?? '',
          name: site.project.name ?? '',
        }
      : null,
    location: {
      address: '',
      city: '',
      state: '',
      pincode: '',
      ...site.location,
    },
    siteEngineer: toPerson(site.siteEngineer),
    startDate: site.startDate ?? null,
    targetCompletionDate: site.targetCompletionDate ?? null,
    actualCompletionDate: site.actualCompletionDate ?? null,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  };
}

export function toDprDto(doc) {
  const dpr = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(dpr._id),
    reportNumber: dpr.reportNumber,
    project: dpr.project
      ? {
          id: String(dpr.project._id || dpr.project),
          code: dpr.project.code ?? '',
          name: dpr.project.name ?? '',
        }
      : null,
    site: dpr.site
      ? {
          id: String(dpr.site._id || dpr.site),
          code: dpr.site.code ?? '',
          name: dpr.site.name ?? '',
        }
      : null,
    reportDate: dpr.reportDate,
    weather: dpr.weather ?? { condition: 'sunny', temperature: 28, weatherImpact: 'none' },
    workDone: dpr.workDone ?? [],
    labourAttendance: dpr.labourAttendance ?? [],
    materialUsage: dpr.materialUsage ?? [],
    equipmentUsage: dpr.equipmentUsage ?? [],
    siteIssues: (dpr.siteIssues ?? []).map((issue) => ({
      ...issue,
      assignedTo: toPerson(issue.assignedTo),
    })),
    photos: dpr.photos ?? [],
    remarks: dpr.remarks ?? '',
    status: dpr.status,
    submittedBy: toPerson(dpr.submittedBy),
    submittedAt: dpr.submittedAt ?? null,
    decidedBy: toPerson(dpr.decidedBy),
    decidedAt: dpr.decidedAt ?? null,
    decisionComment: dpr.decisionComment ?? '',
    approvalHistory: (dpr.approvalHistory ?? []).map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      by: toPerson(h.by),
      comment: h.comment ?? '',
      at: h.at,
    })),
    createdBy: toPerson(dpr.createdBy),
    createdAt: dpr.createdAt,
    updatedAt: dpr.updatedAt,
  };
}

const scoped = (user, filter) => ({
  $and: [buildProjectScope(user, { projectField: 'project' }), filter],
});

/* =========================================================================
 * SITES
 * ========================================================================= */

export async function listSites(user, query = {}) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.project) filter.project = query.project;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: pattern }, { code: pattern }, { 'location.city': pattern }];
  }

  const pagination = parsePagination(query, { allowedSortFields: SITE_SORT_FIELDS, defaultSort: '-createdAt' });
  const { items, meta } = await paginate(Site, scoped(user, filter), pagination, {
    populate: [
      { path: 'project', select: PROJECT_SELECT },
      { path: 'siteEngineer', select: PERSON_SELECT },
    ],
  });

  return { items: items.map(toSiteDto), meta };
}

export async function getSiteById(user, id) {
  const site = await Site.findOne(scoped(user, { _id: id }))
    .populate('project', PROJECT_SELECT)
    .populate('siteEngineer', PERSON_SELECT);
  if (!site) throw ApiError.notFound('Site not found');
  return toSiteDto(site);
}

export async function createSite(user, input) {
  if (!canAccessProject(user, input.project)) {
    throw ApiError.forbidden('You do not have access to this project');
  }

  const project = await Project.findById(input.project);
  if (!project) throw ApiError.notFound('Project not found');

  const existing = await Site.findOne({ code: input.code.toUpperCase() });
  if (existing) throw ApiError.conflict('A site with this code already exists');

  if (input.siteEngineer) {
    const engineer = await User.findOne({ _id: input.siteEngineer, status: USER_STATUS.ACTIVE });
    if (!engineer) {
      throw ApiError.validation([{ field: 'siteEngineer', message: 'Choose an active site engineer' }]);
    }
  }

  const site = await Site.create({
    ...input,
    code: input.code.toUpperCase(),
    createdBy: user._id,
    updatedBy: user._id,
  });

  await site.populate([
    { path: 'project', select: PROJECT_SELECT },
    { path: 'siteEngineer', select: PERSON_SELECT },
  ]);

  return toSiteDto(site);
}

export async function updateSite(user, id, input) {
  const site = await Site.findOne(scoped(user, { _id: id }));
  if (!site) throw ApiError.notFound('Site not found');

  if (input.siteEngineer) {
    const engineer = await User.findOne({ _id: input.siteEngineer, status: USER_STATUS.ACTIVE });
    if (!engineer) {
      throw ApiError.validation([{ field: 'siteEngineer', message: 'Choose an active site engineer' }]);
    }
  }

  Object.assign(site, input);
  site.updatedBy = user._id;
  await site.save();

  await site.populate([
    { path: 'project', select: PROJECT_SELECT },
    { path: 'siteEngineer', select: PERSON_SELECT },
  ]);

  return toSiteDto(site);
}

export async function deleteSite(user, id) {
  const site = await Site.findOne(scoped(user, { _id: id }));
  if (!site) throw ApiError.notFound('Site not found');

  const dprCount = await DailyProgressReport.countDocuments({ site: site._id });
  if (dprCount > 0) {
    throw ApiError.badRequest(`Cannot delete site with ${dprCount} existing daily progress reports. Archive or mark it completed instead.`);
  }

  await Site.findByIdAndDelete(id);
  return { id, code: site.code, name: site.name };
}

/* =========================================================================
 * DAILY PROGRESS REPORTS (DPR)
 * ========================================================================= */

export async function listDprs(user, query = {}) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.project) filter.project = query.project;
  if (query.site) filter.site = query.site;

  if (query.startDate || query.endDate) {
    filter.reportDate = {};
    if (query.startDate) filter.reportDate.$gte = query.startDate;
    if (query.endDate) filter.reportDate.$lte = query.endDate;
  }

  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ reportNumber: pattern }, { remarks: pattern }, { 'workDone.description': pattern }];
  }

  const pagination = parsePagination(query, { allowedSortFields: DPR_SORT_FIELDS, defaultSort: '-reportDate' });
  const { items, meta } = await paginate(DailyProgressReport, scoped(user, filter), pagination, {
    populate: [
      { path: 'project', select: PROJECT_SELECT },
      { path: 'site', select: 'code name' },
      { path: 'createdBy', select: PERSON_SELECT },
      { path: 'submittedBy', select: PERSON_SELECT },
      { path: 'decidedBy', select: PERSON_SELECT },
    ],
  });

  return { items: items.map(toDprDto), meta };
}

export async function getDprById(user, id) {
  const dpr = await DailyProgressReport.findOne(scoped(user, { _id: id }))
    .populate('project', PROJECT_SELECT)
    .populate('site', 'code name location')
    .populate('createdBy', PERSON_SELECT)
    .populate('submittedBy', PERSON_SELECT)
    .populate('decidedBy', PERSON_SELECT)
    .populate('siteIssues.assignedTo', PERSON_SELECT)
    .populate('approvalHistory.by', PERSON_SELECT);
  if (!dpr) throw ApiError.notFound('Daily progress report not found');
  return toDprDto(dpr);
}

export async function createDpr(user, input) {
  if (!canAccessProject(user, input.project)) {
    throw ApiError.forbidden('You do not have access to this project');
  }

  const [project, site] = await Promise.all([
    Project.findById(input.project),
    Site.findById(input.site),
  ]);

  if (!project) throw ApiError.notFound('Project not found');
  if (!site || String(site.project) !== String(project._id)) {
    throw ApiError.badRequest('Selected site does not belong to this project');
  }

  // Generate unique report number: DPR-<PROJECT_CODE>-<YYYYMMDD>-<COUNT+1>
  const dateObj = new Date(input.reportDate);
  const dateStr = dateObj.toISOString().slice(0, 10).replace(/-/g, '');
  const dayCount = await DailyProgressReport.countDocuments({
    project: project._id,
    reportDate: {
      $gte: new Date(`${input.reportDate.slice(0, 10)}T00:00:00.000Z`),
      $lte: new Date(`${input.reportDate.slice(0, 10)}T23:59:59.999Z`),
    },
  });
  const reportNumber = `DPR-${project.code}-${dateStr}-${String(dayCount + 1).padStart(3, '0')}`;

  const dpr = await DailyProgressReport.create({
    ...input,
    reportNumber,
    reportDate: dateObj,
    status: APPROVAL_STATUS.DRAFT,
    createdBy: user._id,
    updatedBy: user._id,
  });

  await dpr.populate([
    { path: 'project', select: PROJECT_SELECT },
    { path: 'site', select: 'code name' },
    { path: 'createdBy', select: PERSON_SELECT },
  ]);

  return toDprDto(dpr);
}

export async function updateDpr(user, id, input) {
  const dpr = await DailyProgressReport.findOne(scoped(user, { _id: id }));
  if (!dpr) throw ApiError.notFound('Daily progress report not found');

  if (![APPROVAL_STATUS.DRAFT, APPROVAL_STATUS.REJECTED].includes(dpr.status)) {
    throw ApiError.badRequest(`Cannot edit report while status is "${dpr.status}". Only draft or rejected reports can be edited.`);
  }

  Object.assign(dpr, input);
  if (input.reportDate) dpr.reportDate = new Date(input.reportDate);
  dpr.updatedBy = user._id;
  await dpr.save();

  await dpr.populate([
    { path: 'project', select: PROJECT_SELECT },
    { path: 'site', select: 'code name' },
    { path: 'createdBy', select: PERSON_SELECT },
  ]);

  return toDprDto(dpr);
}

export async function transitionDpr(user, id, { status: targetStatus, comment }) {
  const dpr = await DailyProgressReport.findOne(scoped(user, { _id: id }));
  if (!dpr) throw ApiError.notFound('Daily progress report not found');

  dpr.transitionTo(targetStatus, user._id, comment);
  dpr.updatedBy = user._id;
  await dpr.save();

  await dpr.populate([
    { path: 'project', select: PROJECT_SELECT },
    { path: 'site', select: 'code name' },
    { path: 'createdBy', select: PERSON_SELECT },
    { path: 'submittedBy', select: PERSON_SELECT },
    { path: 'decidedBy', select: PERSON_SELECT },
    { path: 'approvalHistory.by', PERSON_SELECT },
  ]);

  return toDprDto(dpr);
}

