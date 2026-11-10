import { api, unwrap } from './api';

export const searchService = {
  search: (q) => api.get('/search', { params: { q } }).then(unwrap),
};

