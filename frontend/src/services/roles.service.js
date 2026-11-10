import { api, unwrap } from './api';

export const rolesService = {
  list: (params) => api.get('/roles', { params }).then(unwrap),
  get: (id) => api.get(`/roles/${id}`).then(unwrap),
  update: (id, data) => api.patch(`/roles/${id}`, data).then(unwrap),
};

