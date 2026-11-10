import { api, unwrap } from './api';

export const projectsService = {
  list: (params) => api.get('/projects', { params }).then(unwrap),
  get: (id) => api.get(`/projects/${id}`).then(unwrap),
  create: (data) => api.post('/projects', data).then(unwrap),
  update: (id, data) => api.patch(`/projects/${id}`, data).then(unwrap),
  team: (id) => api.get(`/projects/${id}/team`).then(unwrap),
  addMember: (id, userId) => api.post(`/projects/${id}/team`, { userId }).then(unwrap),
  removeMember: (id, userId) => api.delete(`/projects/${id}/team/${userId}`).then(unwrap),
  lookupUsers: (param) => {
    const params = typeof param === 'string' ? (param ? { q: param } : undefined) : param;
    return api.get('/projects/lookup/users', { params }).then(unwrap);
  },
};
