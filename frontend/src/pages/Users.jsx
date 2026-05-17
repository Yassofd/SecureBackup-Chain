import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users as UsersIcon, Plus, Loader2, AlertTriangle, User, Mail, Shield, ShieldCheck, Eye } from 'lucide-react';
import clsx from 'clsx';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] } } };

const ROLE_CFG = {
  admin:       { label: 'Admin',       badge: 'badge-red',    icon: Shield },
  responsable: { label: 'Responsable', badge: 'badge-blue',   icon: ShieldCheck },
  auditeur:    { label: 'Auditeur',    badge: 'badge-green',  icon: Eye },
};

function AddUserForm({ onDone }) {
  const [form, setForm]   = useState({ email: '', password: '', role: 'responsable' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await api.post('/auth/register', form);
      onDone();
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-ink-50 flex items-center gap-2"><Plus size={14} className="text-brand" /> Ajouter un utilisateur</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Email</label>
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required className="input" placeholder="user@exemple.com" />
        </div>
        <div>
          <label className="label">Mot de passe temporaire</label>
          <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required minLength={8} className="input" placeholder="Min. 8 caractères" />
        </div>
        <div>
          <label className="label">Rôle</label>
          <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="input">
            <option value="admin">Admin</option>
            <option value="responsable">Responsable</option>
            <option value="auditeur">Auditeur</option>
          </select>
        </div>
      </div>
      {error && <p className="text-red-400 text-xs flex items-center gap-1.5"><AlertTriangle size={12} />{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Créer l'utilisateur
        </button>
        <button type="button" onClick={() => onDone()} className="btn-ghost">Annuler</button>
      </div>
    </form>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError]   = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/auth/users');
      setUsers(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les utilisateurs.');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const isAdmin = me?.role === 'admin';

  return (
    <div className="p-6 space-y-5">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Utilisateurs</h1>
          <p className="page-sub">Gestion des comptes et des rôles</p>
        </div>
        {isAdmin && !adding && (
          <button onClick={() => setAdding(true)} className="btn-primary">
            <Plus size={14} /> Ajouter
          </button>
        )}
      </motion.div>

      {adding && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <AddUserForm onDone={() => { setAdding(false); load(); }} />
        </motion.div>
      )}

      {/* Roles legend */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex flex-wrap gap-2">
        {Object.entries(ROLE_CFG).map(([role, { label, badge, icon: Icon }]) => (
          <div key={role} className={clsx(badge, 'flex items-center gap-1.5')}>
            <Icon size={11} /> {label}
          </div>
        ))}
      </motion.div>

      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title flex items-center gap-2"><UsersIcon size={13} className="text-brand" /> Comptes</span>
            <span className="text-xs text-ink-300 font-mono">{users.length} utilisateur(s)</span>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="w-5 h-5 border-2 border-ink-500 border-t-brand rounded-full animate-spin mx-auto" />
              <p className="text-ink-300 text-xs mt-3">Chargement…</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <AlertTriangle size={24} className="text-amber-400 mx-auto mb-2" />
              <p className="text-ink-300 text-sm">{error}</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-700/60">
              {users.map((u) => {
                const cfg = ROLE_CFG[u.role] ?? ROLE_CFG.responsable;
                const RIcon = cfg.icon;
                const isMe = u.email === me?.email;
                return (
                  <div key={u.id ?? u.email} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-brand">{u.email?.[0]?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-ink-100 truncate">{u.email}</p>
                        {isMe && <span className="text-[10px] text-ink-400 font-mono bg-ink-700 px-1.5 py-0.5 rounded">vous</span>}
                      </div>
                      <p className="text-[11px] text-ink-400 font-mono mt-0.5">
                        {u.createdAt ? `Créé le ${new Date(u.createdAt).toLocaleDateString('fr-FR')}` : 'Compte système'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {u.mfaEnabled && (
                        <span className="text-[10px] badge-green flex items-center gap-1"><ShieldCheck size={9} /> MFA</span>
                      )}
                      <span className={clsx(cfg.badge, 'flex items-center gap-1')}>
                        <RIcon size={10} /> {cfg.label}
                      </span>
                    </div>
                  </div>
                );
              })}
              {users.length === 0 && (
                <div className="p-12 text-center">
                  <User size={24} className="text-ink-500 mx-auto mb-2" />
                  <p className="text-ink-300 text-sm">Aucun utilisateur trouvé.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
