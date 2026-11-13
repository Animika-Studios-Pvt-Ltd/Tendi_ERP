import { api, unwrap } from './api';

export const estimationService = {
  /* Rate Analysis */
  listRateAnalyses: (params) => api.get('/estimation/rate-analyses', { params }).then(unwrap),
  createRateAnalysis: (data) => api.post('/estimation/rate-analyses', data).then(unwrap),
  updateRateAnalysis: (id, data) => api.patch(`/estimation/rate-analyses/${id}`, data).then(unwrap),
  deleteRateAnalysis: (id) => api.delete(`/estimation/rate-analyses/${id}`).then(unwrap),

  /* Estimates & BOQ */
  listEstimates: (params) => api.get('/estimation/estimates', { params }).then(unwrap),
  getEstimate: (id) => api.get(`/estimation/estimates/${id}`).then(unwrap),
  createEstimate: (data) => api.post('/estimation/estimates', data).then(unwrap),
  updateEstimate: (id, data) => api.patch(`/estimation/estimates/${id}`, data).then(unwrap),
  reviseEstimate: (id, data) => api.post(`/estimation/estimates/${id}/revise`, data).then(unwrap),
  transitionEstimate: (id, data) => api.post(`/estimation/estimates/${id}/transition`, data).then(unwrap),
  convertToProject: (id, data) => api.post(`/estimation/estimates/${id}/convert-to-project`, data).then(unwrap),
  getBudgetAnalysis: (id) => api.get(`/estimation/estimates/${id}/budget-analysis`).then(unwrap),

  addBoqItem: (estimateId, data) => api.post(`/estimation/estimates/${estimateId}/boq-items`, data).then(unwrap),
  updateBoqItem: (estimateId, itemId, data) =>
    api.patch(`/estimation/estimates/${estimateId}/boq-items/${itemId}`, data).then(unwrap),
  deleteBoqItem: (estimateId, itemId) =>
    api.delete(`/estimation/estimates/${estimateId}/boq-items/${itemId}`).then(unwrap),

  /* Tenders & Bids */
  listTenders: (params) => api.get('/estimation/tenders', { params }).then(unwrap),
  getTender: (id) => api.get(`/estimation/tenders/${id}`).then(unwrap),
  createTender: (data) => api.post('/estimation/tenders', data).then(unwrap),
  updateTender: (id, data) => api.patch(`/estimation/tenders/${id}`, data).then(unwrap),
  addBid: (tenderId, data) => api.post(`/estimation/tenders/${tenderId}/bids`, data).then(unwrap),
  awardTender: (tenderId, data) => api.post(`/estimation/tenders/${tenderId}/award`, data).then(unwrap),
};

