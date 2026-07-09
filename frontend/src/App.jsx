import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Backups from './pages/Backups';
import BackupDetail from './pages/BackupDetail';
import Verify from './pages/Verify';
import SshServers from './pages/SshServers';
import SftpServers from './pages/SftpServers';
import RemoteSftpBackup from './pages/RemoteSftpBackup';
import RemoteBackup from './pages/RemoteBackup';
import Schedules from './pages/Schedules';
import Notifications from './pages/Notifications';
import Audit from './pages/Audit';
import Network from './pages/Network';
import Deployment from './pages/Deployment';
import Monitoring from './pages/Monitoring';
import Security from './pages/Security';
import Settings from './pages/Settings';
import Users from './pages/Users';

function AppRoutes() {
  const [status, setStatus] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/setup/status')
      .then(({ data }) => {
        setStatus(data.initialized);
        if (!data.initialized) navigate('/setup', { replace: true });
      })
      .catch(() => setStatus(true));
  }, []);

  if (status === null) {
    return (
      <div className="min-h-screen bg-ink-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-ink-600 border-t-brand rounded-full animate-spin" />
          <p className="text-ink-400 text-sm">Chargement…</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="backups" element={<Backups />} />
        <Route path="backups/:id" element={<BackupDetail />} />
        <Route path="verify" element={<Verify />} />
        <Route path="ssh-servers" element={<SshServers />} />
        <Route path="sftp-servers" element={<SftpServers />} />
        <Route path="sftp-backup" element={<RemoteSftpBackup />} />
        <Route path="remote-backup" element={<RemoteBackup />} />
        <Route path="schedules" element={<Schedules />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="audit" element={<Audit />} />
        <Route path="network" element={<Network />} />
        <Route path="deployment" element={<Deployment />} />
        <Route path="monitoring" element={<Monitoring />} />
        <Route path="security" element={<Security />} />
        <Route path="settings" element={<Settings />} />
        <Route path="users" element={<Users />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
