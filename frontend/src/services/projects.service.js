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

  /* Tasks */
  listTasks: (params) => api.get('/projects/tasks', { params }).then(unwrap),
  getTask: (id) => api.get(`/projects/tasks/${id}`).then(unwrap),
  createTask: (data) => api.post('/projects/tasks', data).then(unwrap),
  updateTask: (id, data) => api.patch(`/projects/tasks/${id}`, data).then(unwrap),
  deleteTask: (id) => api.delete(`/projects/tasks/${id}`).then(unwrap),

  /* Milestones */
  listMilestones: (params) => api.get('/projects/milestones', { params }).then(unwrap),
  getMilestone: (id) => api.get(`/projects/milestones/${id}`).then(unwrap),
  createMilestone: (data) => api.post('/projects/milestones', data).then(unwrap),
  updateMilestone: (id, data) => api.patch(`/projects/milestones/${id}`, data).then(unwrap),
  deleteMilestone: (id) => api.delete(`/projects/milestones/${id}`).then(unwrap),
};
