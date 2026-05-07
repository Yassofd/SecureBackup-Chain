import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const backupsApi = {
  list: () => api.get('/backups'),
  get: (id) => api.get(`/backups/${id}`),
  upload: (formData, onProgress) =>
    api.post('/backups', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    }),
  verify: (id, formData) =>
    api.post(`/backups/${id}/verify`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  download: (id) => api.get(`/backups/${id}/download`, { responseType: 'blob' }),
  health: () => api.get('/health'),
};

export default api;
