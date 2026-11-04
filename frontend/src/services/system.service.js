import { api, unwrap } from './api';

export const systemService = {
  health: () => api.get('/health').then(unwrap),
};
