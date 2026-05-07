import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Backups from './pages/Backups';
import BackupDetail from './pages/BackupDetail';
import Verify from './pages/Verify';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
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
            <Route
              path="verify"
              element={
                <PrivateRoute roles={['admin', 'responsable', 'auditeur']}>
                  <Verify />
                </PrivateRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
