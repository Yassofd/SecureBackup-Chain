import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post('/api/auth/refresh', { refreshToken });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      } else {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export const authApi = {
  login: (body) => api.post('/auth/login', body),
  me: () => api.get('/auth/me'),
  register: (body) => api.post('/auth/register', body),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  mfaEnable: () => api.post('/auth/mfa/enable'),
  mfaConfirm: (token) => api.post('/auth/mfa/confirm', { token }),
  mfaDisable: () => api.post('/auth/mfa/disable'),
};

export const backupsApi = {
  list: () => api.get('/backups'),
  get: (id) => api.get(`/backups/${id}`),
  upload: (formData, onProgress) =>
    api.post('/backups', formData, { onUploadProgress: onProgress }),
  verify: (id, formData) =>
    api.post(`/backups/${id}/verify`, formData),
  download: (id) => api.get(`/backups/${id}/download`, { responseType: 'blob' }),
  restoreRemote: (id, data) => api.post(`/backups/${id}/restore-remote`, data),
  health: () => api.get('/health'),
};

export const sshServersApi = {
  list: () => api.get('/ssh-servers'),
  test: (id) => api.post(`/ssh-servers/${id}/test`),
};

export const sftpServersApi = {
  list:   ()         => api.get('/sftp-servers'),
  create: (data)     => api.post('/sftp-servers', data),
  update: (id, data) => api.put(`/sftp-servers/${id}`, data),
  delete: (id)       => api.delete(`/sftp-servers/${id}`),
  test:   (id)       => api.post(`/sftp-servers/${id}/test`),
};

export const backupsSftpApi = {
  backupFrom: (data)     => api.post('/backups/sftp-remote', data),
  restoreTo:  (id, data) => api.post(`/backups/${id}/restore-sftp`, data),
};

export const notificationsApi = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  remove: (id) => api.delete(`/notifications/${id}`),
};

export const auditApi = {
  list: (params) => api.get('/audit', { params }),
  exportCsv: (params) => api.get('/audit/export', { params: { ...params, format: 'csv' }, responseType: 'blob' }),
  exportPdf: (params) => api.get('/audit/export', { params: { ...params, format: 'pdf' }, responseType: 'blob' }),
};

export const networkApi = {
  topology: () => api.get('/network/topology'),
  health:   () => api.get('/network/health'),
  node:     (id) => api.get(`/network/nodes/${id}`),
  logs:     (id, lines = 50) => api.get(`/network/nodes/${id}/logs`, { params: { lines } }),
};

export const deploymentApi = {
  listNodes:  ()         => api.get('/deployment/nodes'),
  deleteNode: (id)       => api.delete(`/deployment/nodes/${id}`),
  stopNode:   (orgNum)   => api.post(`/deployment/org/${orgNum}/stop`),
  startNode:  (orgNum)   => api.post(`/deployment/org/${orgNum}/start`),
};

export default api;
