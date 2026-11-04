import { api, unwrap } from './api';

export const authService = {
  login: (credentials) => api.post('/auth/login', credentials).then(unwrap),
  logout: () => api.post('/auth/logout').then(unwrap),
  me: () => api.get('/auth/me').then(unwrap),
  updateProfile: (data) => api.patch('/auth/me', data).then(unwrap),
  changePassword: (data) => api.post('/auth/change-password', data).then(unwrap),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then(unwrap),
  resetPassword: (data) => api.post('/auth/reset-password', data).then(unwrap),
};
