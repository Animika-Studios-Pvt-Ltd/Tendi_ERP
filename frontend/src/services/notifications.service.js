import { api, unwrap } from './api';

export const notificationsService = {
  list: (params) => api.get('/notifications', { params }).then(unwrap),
  pendingApprovals: () => api.get('/notifications/pending-approvals').then(unwrap),
  markRead: (id) => api.patch(`/notifications/${id}/read`).then(unwrap),
  markAllRead: () => api.post('/notifications/read-all').then(unwrap),
};

