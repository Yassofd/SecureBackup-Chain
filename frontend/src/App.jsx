import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Backups from './pages/Backups';
import BackupDetail from './pages/BackupDetail';
import Verify from './pages/Verify';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="backups" element={<Backups />} />
          <Route path="backups/:id" element={<BackupDetail />} />
          <Route path="verify" element={<Verify />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
