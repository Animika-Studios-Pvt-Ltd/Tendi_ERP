import { api, unwrap } from './api';

export const sitesService = {
  listSites: (params) => api.get('/sites', { params }).then(unwrap),
  getSite: (id) => api.get(`/sites/${id}`).then(unwrap),
  createSite: (data) => api.post('/sites', data).then(unwrap),
  updateSite: (id, data) => api.patch(`/sites/${id}`, data).then(unwrap),
  deleteSite: (id) => api.delete(`/sites/${id}`).then(unwrap),

  listDprs: (params) => api.get('/sites/dpr', { params }).then(unwrap),
  getDpr: (id) => api.get(`/sites/dpr/${id}`).then(unwrap),
  createDpr: (data) => api.post('/sites/dpr', data).then(unwrap),
  updateDpr: (id, data) => api.patch(`/sites/dpr/${id}`, data).then(unwrap),
  transitionDpr: (id, data) => api.post(`/sites/dpr/${id}/transition`, data).then(unwrap),
};

