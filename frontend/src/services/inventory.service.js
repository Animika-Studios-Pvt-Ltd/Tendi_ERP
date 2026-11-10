import { api, unwrap } from './api';

export const inventoryService = {
  getStock: (params) => api.get('/inventory/stock', { params }).then(unwrap),
  listMaterials: (params) => api.get('/inventory/materials', { params }).then(unwrap),
  getMaterial: (id) => api.get(`/inventory/materials/${id}`).then(unwrap),
  createMaterial: (data) => api.post('/inventory/materials', data).then(unwrap),
  updateMaterial: (id, data) => api.patch(`/inventory/materials/${id}`, data).then(unwrap),
  deleteMaterial: (id) => api.delete(`/inventory/materials/${id}`).then(unwrap),
  listTransactions: (params) => api.get('/inventory/transactions', { params }).then(unwrap),
  recordTransaction: (data) => api.post('/inventory/transactions', data).then(unwrap),
  transferStock: (data) => api.post('/inventory/transfers', data).then(unwrap),
};

