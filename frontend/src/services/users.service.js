import { api, unwrap } from './api';

export const usersService = {
  list: (params) => api.get('/users', { params }).then(unwrap),
  get: (id) => api.get(`/users/${id}`).then(unwrap),
  create: (data) => api.post('/users', data).then(unwrap),
  update: (id, data) => api.patch(`/users/${id}`, data).then(unwrap),
  setStatus: (id, status) => api.patch(`/users/${id}/status`, { status }).then(unwrap),
  setPermissions: (id, permissionOverrides) => api.patch(`/users/${id}/permissions`, { permissionOverrides }).then(unwrap),
  assignProjects: (id, projectIds) => api.post(`/users/${id}/projects`, { projectIds }).then(unwrap),
  removeProject: (id, projectId) => api.delete(`/users/${id}/projects/${projectId}`).then(unwrap),
  availableProjects: (id) => api.get(`/users/${id}/available-projects`).then(unwrap),
};

