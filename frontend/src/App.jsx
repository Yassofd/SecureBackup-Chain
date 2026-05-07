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
import RemoteBackup from './pages/RemoteBackup';
import Schedules from './pages/Schedules';
import Notifications from './pages/Notifications';
import Audit from './pages/Audit';

function AppRoutes() {
  const [status, setStatus] = useState(null); // null = loading
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/setup/status')
      .then(({ data }) => {
        setStatus(data.initialized);
        if (!data.initialized) navigate('/setup', { replace: true });
      })
      .catch(() => setStatus(true)); // si API down, laisser passer
  }, []);

  if (status === null) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Chargement…</div>
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
        <Route path="remote-backup" element={<RemoteBackup />} />
        <Route path="schedules" element={<Schedules />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="audit" element={<Audit />} />
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
