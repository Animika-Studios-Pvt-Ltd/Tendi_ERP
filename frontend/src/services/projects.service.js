import { api, unwrap } from './api';

export const projectsService = {
  list: (params) => api.get('/projects', { params }).then(unwrap),
  get: (id) => api.get(`/projects/${id}`).then(unwrap),
  create: (data) => api.post('/projects', data).then(unwrap),
  update: (id, data) => api.patch(`/projects/${id}`, data).then(unwrap),
  team: (id) => api.get(`/projects/${id}/team`).then(unwrap),
  addMember: (id, userId) => api.post(`/projects/${id}/team`, { userId }).then(unwrap),
  removeMember: (id, userId) => api.delete(`/projects/${id}/team/${userId}`).then(unwrap),
  lookupUsers: (q) => api.get('/projects/lookup/users', { params: q ? { q } : undefined }).then(unwrap),
};
