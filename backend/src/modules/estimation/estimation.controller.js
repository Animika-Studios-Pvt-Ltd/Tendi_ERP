import { MODULES } from '../../config/rbac.js';
import { recordAudit } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as service from './estimation.service.js';

const audit = (req, action, entityType, entityId, project, summary, extra = {}) =>
  recordAudit(req, {
    action,
    module: MODULES.ESTIMATION,
    entityType,
    entityId,
    project: project || undefined,
    summary,
    ...extra,
  });

/* Rate Analyses */
export async function listRateAnalyses(req, res) {
  const { items, meta } = await service.listRateAnalyses(req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function createRateAnalysis(req, res) {
  const doc = await service.createRateAnalysis(req.user, req.body);
  audit(req, 'rate_analysis.create', 'RateAnalysis', doc.id, null, `Created rate analysis ${doc.code} (${doc.name})`);
  sendSuccess(res, doc, { status: 201, message: 'Rate analysis template created' });
}

export async function updateRateAnalysis(req, res) {
  const doc = await service.updateRateAnalysis(req.user, req.validated.params.id, req.body);
  audit(req, 'rate_analysis.update', 'RateAnalysis', doc.id, null, `Updated rate analysis ${doc.code}`);
  sendSuccess(res, doc, { message: 'Rate analysis updated' });
}

export async function deleteRateAnalysis(req, res) {
  const result = await service.deleteRateAnalysis(req.validated.params.id);
  audit(req, 'rate_analysis.delete', 'RateAnalysis', result.id, null, `Deleted rate analysis ${result.code}`);
  sendSuccess(res, null, { message: 'Rate analysis deleted' });
}

/* Estimates */
export async function listEstimates(req, res) {
  const { items, meta } = await service.listEstimates(req.user, req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function getEstimate(req, res) {
  const data = await service.getEstimateById(req.user, req.validated.params.id);
  sendSuccess(res, data);
}

export async function createEstimate(req, res) {
  const doc = await service.createEstimate(req.user, req.body);
  audit(req, 'estimate.create', 'Estimate', doc.id, doc.project?.id || doc.project, `Created estimate ${doc.estimateNumber}`);
  sendSuccess(res, doc, { status: 201, message: 'Estimate created' });
}

export async function updateEstimate(req, res) {
  const doc = await service.updateEstimate(req.user, req.validated.params.id, req.body);
  audit(req, 'estimate.update', 'Estimate', doc.id, doc.project?.id || doc.project, `Updated estimate ${doc.estimateNumber}`);
  sendSuccess(res, doc, { message: 'Estimate updated' });
}

export async function reviseEstimate(req, res) {
  const doc = await service.createEstimateRevision(req.user, req.validated.params.id, req.body);
  audit(req, 'estimate.revise', 'Estimate', doc.id, doc.project?.id || doc.project, `Created revision v${doc.version} (${doc.estimateNumber})`);
  sendSuccess(res, doc, { status: 201, message: `Estimate revision v${doc.version} created` });
}

export async function transitionEstimate(req, res) {
  const doc = await service.transitionEstimate(req.user, req.validated.params.id, req.body);
  audit(req, `estimate.${doc.status}`, 'Estimate', doc.id, doc.project?.id || doc.project, `Estimate ${doc.estimateNumber} -> ${doc.status}`, {
    changes: { comment: req.body.comment },
  });
  sendSuccess(res, doc, { message: `Estimate ${doc.status}` });
}

export async function convertToProject(req, res) {
  const result = await service.convertEstimateToProject(req.user, req.validated.params.id, req.body);
  audit(
    req,
    'estimate.convert_to_project',
    'Estimate',
    result.estimate.id,
    result.project.id,
    `Converted estimate ${result.estimate.estimateNumber} to project ${result.project.code}`,
  );
  sendSuccess(res, result, { status: 201, message: `Converted to project ${result.project.code}` });
}

export async function getBudgetAnalysis(req, res) {
  const data = await service.getBudgetAnalysis(req.user, req.validated.params.id);
  sendSuccess(res, data);
}

/* BOQ Line Items */
export async function addBoqItem(req, res) {
  const item = await service.addBoqItem(req.user, req.validated.params.id, req.body);
  audit(req, 'boq.create', 'BoqItem', item.id, item.project, `Added BOQ item "${item.description}"`);
  sendSuccess(res, item, { status: 201, message: 'BOQ item added' });
}

export async function updateBoqItem(req, res) {
  const { id, itemId } = req.validated.params;
  const item = await service.updateBoqItem(req.user, id, itemId, req.body);
  audit(req, 'boq.update', 'BoqItem', item.id, item.project, `Updated BOQ item "${item.description}"`);
  sendSuccess(res, item, { message: 'BOQ item updated' });
}

export async function deleteBoqItem(req, res) {
  const { id, itemId } = req.validated.params;
  const result = await service.deleteBoqItem(req.user, id, itemId);
  audit(req, 'boq.delete', 'BoqItem', result.id, null, `Deleted BOQ item "${result.description}"`);
  sendSuccess(res, null, { message: 'BOQ item deleted' });
}

/* Tenders & Bids */
export async function listTenders(req, res) {
  const { items, meta } = await service.listTenders(req.user, req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function getTender(req, res) {
  const doc = await service.getTenderById(req.user, req.validated.params.id);
  sendSuccess(res, doc);
}

export async function createTender(req, res) {
  const doc = await service.createTender(req.user, req.body);
  audit(req, 'tender.create', 'Tender', doc.id, doc.project?.id || doc.project, `Created tender ${doc.tenderNumber}`);
  sendSuccess(res, doc, { status: 201, message: 'Tender created' });
}

export async function updateTender(req, res) {
  const doc = await service.updateTender(req.user, req.validated.params.id, req.body);
  audit(req, 'tender.update', 'Tender', doc.id, doc.project?.id || doc.project, `Updated tender ${doc.tenderNumber}`);
  sendSuccess(res, doc, { message: 'Tender updated' });
}

export async function addBid(req, res) {
  const doc = await service.addTenderBid(req.user, req.validated.params.id, req.body);
  audit(req, 'tender.bid_add', 'Tender', doc.id, doc.project?.id || doc.project, `Logged bid for ${doc.tenderNumber}`);
  sendSuccess(res, doc, { status: 201, message: 'Bid logged to tender' });
}

export async function awardTender(req, res) {
  const doc = await service.awardTenderBid(req.user, req.validated.params.id, req.body);
  audit(req, 'tender.award', 'Tender', doc.id, doc.project?.id || doc.project, `Awarded tender ${doc.tenderNumber}`);
  sendSuccess(res, doc, { message: 'Tender awarded successfully' });
}

