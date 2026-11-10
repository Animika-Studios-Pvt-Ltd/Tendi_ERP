import { api, unwrap } from './api';

export const procurementService = {
  /* Vendors */
  listVendors: (params) => api.get('/procurement/vendors', { params }).then(unwrap),
  getVendor: (id) => api.get(`/procurement/vendors/${id}`).then(unwrap),
  createVendor: (data) => api.post('/procurement/vendors', data).then(unwrap),
  updateVendor: (id, data) => api.patch(`/procurement/vendors/${id}`, data).then(unwrap),
  deleteVendor: (id) => api.delete(`/procurement/vendors/${id}`).then(unwrap),

  /* Material Requests */
  listRequests: (params) => api.get('/procurement/requests', { params }).then(unwrap),
  getRequest: (id) => api.get(`/procurement/requests/${id}`).then(unwrap),
  createRequest: (data) => api.post('/procurement/requests', data).then(unwrap),
  updateRequest: (id, data) => api.patch(`/procurement/requests/${id}`, data).then(unwrap),
  transitionRequest: (id, data) => api.post(`/procurement/requests/${id}/transition`, data).then(unwrap),

  /* Purchase Orders */
  listPos: (params) => api.get('/procurement/purchase-orders', { params }).then(unwrap),
  getPo: (id) => api.get(`/procurement/purchase-orders/${id}`).then(unwrap),
  createPo: (data) => api.post('/procurement/purchase-orders', data).then(unwrap),
  updatePo: (id, data) => api.patch(`/procurement/purchase-orders/${id}`, data).then(unwrap),
  transitionPo: (id, data) => api.post(`/procurement/purchase-orders/${id}/transition`, data).then(unwrap),

  /* Goods Receipts (GRN) */
  listGrns: (params) => api.get('/procurement/goods-receipts', { params }).then(unwrap),
  getGrn: (id) => api.get(`/procurement/goods-receipts/${id}`).then(unwrap),
  createGrn: (data) => api.post('/procurement/goods-receipts', data).then(unwrap),
};

