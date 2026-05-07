import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body = { email, password };
      if (mfaRequired) body.mfaToken = mfaToken;
      const { data } = await authApi.login(body);
      if (data.mfaRequired) { setMfaRequired(true); setLoading(false); return; }
      login(data.user, data.accessToken, data.refreshToken);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur de connexion');
    }
    setLoading(false);
  };

  const roleColors = {
    admin: 'bg-red-100 text-red-700',
    responsable: 'bg-blue-100 text-blue-700',
    auditeur: 'bg-green-100 text-green-700',
  };

  const demoUsers = [
    { email: 'admin@securebackup.local', password: 'Admin@1234!', role: 'admin' },
    { email: 'responsable@securebackup.local', password: 'Resp@1234!', role: 'responsable' },
    { email: 'auditeur@securebackup.local', password: 'Audit@1234!', role: 'auditeur' },
  ];

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-4">
            <Shield className="text-white" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white">SecureBackup-Chain</h1>
          <p className="text-slate-400 text-sm mt-1">Connexion sécurisée</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={mfaRequired}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={mfaRequired}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {mfaRequired && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Code d'authentification (MFA)
                </label>
                <input
                  type="text"
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  autoFocus
                />
              </div>
            )}

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Connexion…' : mfaRequired ? 'Vérifier' : 'Se connecter'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-3">Comptes de démonstration</p>
            <div className="space-y-2">
              {demoUsers.map((u) => (
                <button
                  key={u.role}
                  onClick={() => { setEmail(u.email); setPassword(u.password); setMfaRequired(false); }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 text-left transition-colors"
                >
                  <span className="text-xs text-gray-600">{u.email}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleColors[u.role]}`}>
                    {u.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
