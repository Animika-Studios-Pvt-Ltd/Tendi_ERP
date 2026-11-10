import { api, unwrap } from './api';

export const settingsService = {
  get: () => api.get('/settings').then(unwrap),
  getMasterData: () => api.get('/settings/master-data').then(unwrap),
  update: (data) => api.patch('/settings', data).then(unwrap),
};

