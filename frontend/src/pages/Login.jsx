import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaReq,   setMfaReq]  = useState(false);
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const { login } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const body = { email, password };
      if (mfaReq) body.mfaToken = mfaToken;
      const { data } = await authApi.login(body);
      if (data.mfaRequired) { setMfaReq(true); setLoading(false); return; }
      login(data.user, data.accessToken, data.refreshToken);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Identifiants incorrects');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-brand/[0.06] rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo + title */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand/[0.12] border border-brand/25 rounded-2xl mb-4">
            <Shield size={24} className="text-brand" />
          </div>
          <h1 className="text-2xl font-bold text-ink-50 tracking-tight">SecureBackup-Chain</h1>
          <p className="text-ink-300 text-sm mt-1">Connexion sécurisée</p>
        </div>

        {/* Form panel */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">{mfaReq ? 'Authentification MFA' : 'Connexion'}</span>
          </div>
          <div className="panel-body">
            <form onSubmit={handleSubmit} className="space-y-4">
              {!mfaReq && (
                <>
                  <div>
                    <label className="label">Email</label>
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      required className="input" placeholder="admin@example.com"
                    />
                  </div>
                  <div>
                    <label className="label">Mot de passe</label>
                    <div className="relative">
                      <input
                        type={showPwd ? 'text' : 'password'} value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required className="input pr-10" placeholder="••••••••"
                      />
                      <button
                        type="button" onClick={() => setShowPwd(!showPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-100 transition-colors"
                      >
                        {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {mfaReq && (
                <div>
                  <label className="label">Code MFA</label>
                  <input
                    type="text" value={mfaToken}
                    onChange={(e) => setMfaToken(e.target.value)}
                    placeholder="123456" maxLength={6} autoFocus
                    className="input font-mono text-center text-lg tracking-[0.5em]"
                  />
                  <p className="text-xs text-ink-300 mt-1.5">Entrez le code de votre application d'authentification.</p>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Connexion…</>
                  : mfaReq ? 'Vérifier' : 'Se connecter'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
