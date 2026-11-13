import { MODULES } from '../../config/rbac.js';
import { recordAudit } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as service from './sites.service.js';

const audit = (req, action, extra = {}) =>
  recordAudit(req, {
    action,
    module: MODULES.SITES,
    ...extra,
  });

/* SITES */

export async function listSites(req, res) {
  const { items, meta } = await service.listSites(req.user, req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function getSite(req, res) {
  const site = await service.getSiteById(req.user, req.validated.params.id);
  sendSuccess(res, site);
}

export async function createSite(req, res) {
  const site = await service.createSite(req.user, req.body);
  audit(req, 'site.create', {
    entityType: 'Site',
    entityId: site.id,
    project: site.project?.id,
    summary: `Created site ${site.code} (${site.name})`,
  });
  sendSuccess(res, site, { status: 201, message: 'Site created successfully' });
}

export async function updateSite(req, res) {
  const site = await service.updateSite(req.user, req.validated.params.id, req.body);
  audit(req, 'site.update', {
    entityType: 'Site',
    entityId: site.id,
    project: site.project?.id,
    summary: `Updated site ${site.code} (${site.name})`,
  });
  sendSuccess(res, site, { message: 'Site updated successfully' });
}

export async function deleteSite(req, res) {
  const result = await service.deleteSite(req.user, req.validated.params.id);
  audit(req, 'site.delete', {
    entityType: 'Site',
    entityId: result.id,
    summary: `Deleted site ${result.code}`,
  });
  sendSuccess(res, null, { message: 'Site deleted successfully' });
}

/* DAILY PROGRESS REPORTS (DPR) */

export async function listDprs(req, res) {
  const { items, meta } = await service.listDprs(req.user, req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function getDpr(req, res) {
  const dpr = await service.getDprById(req.user, req.validated.params.id);
  sendSuccess(res, dpr);
}

export async function createDpr(req, res) {
  const dpr = await service.createDpr(req.user, req.body);
  audit(req, 'dpr.create', {
    entityType: 'DailyProgressReport',
    entityId: dpr.id,
    project: dpr.project?.id,
    summary: `Created DPR ${dpr.reportNumber} for site ${dpr.site?.code}`,
  });
  sendSuccess(res, dpr, { status: 201, message: 'Daily progress report drafted' });
}

export async function updateDpr(req, res) {
  const dpr = await service.updateDpr(req.user, req.validated.params.id, req.body);
  audit(req, 'dpr.update', {
    entityType: 'DailyProgressReport',
    entityId: dpr.id,
    project: dpr.project?.id,
    summary: `Updated DPR ${dpr.reportNumber}`,
  });
  sendSuccess(res, dpr, { message: 'Daily progress report updated' });
}

export async function transitionDpr(req, res) {
  const dpr = await service.transitionDpr(req.user, req.validated.params.id, req.body);
  audit(req, `dpr.${dpr.status}`, {
    entityType: 'DailyProgressReport',
    entityId: dpr.id,
    project: dpr.project?.id,
    summary: `DPR ${dpr.reportNumber} status transitioned to "${dpr.status}"`,
    changes: { comment: req.body.comment },
  });
  sendSuccess(res, dpr, { message: `Report transitioned to ${dpr.status}` });
}

export async function uploadDprPhotos(req, res) {
  const dpr = await service.addDprPhotos(req.user, req.validated.params.id, req.files, req.body?.caption);
  audit(req, 'dpr.photos_upload', {
    entityType: 'DailyProgressReport',
    entityId: dpr.id,
    project: dpr.project?.id,
    summary: `Uploaded site photos to ${dpr.reportNumber}`,
  });
  sendSuccess(res, dpr, { status: 201, message: 'Site photos uploaded' });
}

export async function downloadDprPhoto(req, res) {
  const data = await service.getDprPhotoDownloadUrl(req.user, req.validated.params.id, req.params.photoId);
  res.set('Cache-Control', 'no-store');
  sendSuccess(res, data);
}

export async function postDprConsumption(req, res) {
  const result = await service.postDprConsumption(req.user, req.validated.params.id);
  audit(req, 'dpr.post_consumption', {
    entityType: 'DailyProgressReport',
    entityId: result.dprId,
    summary: `Posted ${result.postedCount} material issue(s) from ${result.reportNumber}`,
  });
  sendSuccess(res, result, { message: `Posted ${result.postedCount} consumption entries to Inventory` });
}

export async function listInstructions(req, res) {
  sendSuccess(res, await service.listSiteInstructions(req.user, req.validated.query));
}

export async function createInstruction(req, res) {
  const si = await service.createSiteInstruction(req.user, req.body);
  audit(req, 'site_instruction.create', {
    entityType: 'SiteInstruction',
    entityId: si.id,
    project: si.project?._id || si.project,
    summary: `Issued Site Instruction ${si.siNumber}`,
  });
  sendSuccess(res, si, { status: 201, message: 'Site instruction issued' });
}

export async function updateInstruction(req, res) {
  const si = await service.updateSiteInstruction(req.user, req.validated.params.id, req.body);
  audit(req, 'site_instruction.update', {
    entityType: 'SiteInstruction',
    entityId: si.id,
    summary: `Updated Site Instruction ${si.siNumber}`,
  });
  sendSuccess(res, si, { message: 'Site instruction updated' });
}

