import { useState, useEffect } from 'react';
import api from '../services/api';
import { Server, Plus, Trash2, Pencil, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const EMPTY_FORM = {
  name: '', host: '', port: '22', username: '',
  auth_type: 'password', credentials: { password: '' }, description: '',
};

function ServerForm({ initial, onSave, onCancel }) {
  const [form, setForm]   = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set     = (f, v) => setForm((x) => ({ ...x, [f]: v }));
  const setCred = (f, v) => setForm((x) => ({ ...x, credentials: { ...x.credentials, [f]: v } }));

  async function submit(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await onSave({ name: form.name, host: form.host, port: Number(form.port), username: form.username, auth_type: form.auth_type, credentials: form.credentials, description: form.description });
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-ink-50">{initial ? 'Modifier le serveur' : 'Ajouter un serveur SSH'}</h3>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Nom</label>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} className="input" placeholder="Mon serveur de prod" />
        </div>
        <div>
          <label className="label">Hôte / IP</label>
          <input required value={form.host} onChange={(e) => set('host', e.target.value)} className="input" placeholder="192.168.1.10" />
        </div>
        <div>
          <label className="label">Port</label>
          <input type="number" value={form.port} onChange={(e) => set('port', e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Utilisateur</label>
          <input required value={form.username} onChange={(e) => set('username', e.target.value)} className="input" placeholder="ubuntu" />
        </div>
        <div>
          <label className="label">Authentification</label>
          <select value={form.auth_type} onChange={(e) => set('auth_type', e.target.value)} className="input">
            <option value="password">Mot de passe</option>
            <option value="key">Clé privée</option>
          </select>
        </div>

        {form.auth_type === 'password' ? (
          <div className="col-span-2">
            <label className="label">Mot de passe</label>
            <input type="password" value={form.credentials.password || ''} onChange={(e) => setCred('password', e.target.value)} className="input" />
          </div>
        ) : (
          <div className="col-span-2">
            <label className="label">Clé privée (PEM)</label>
            <textarea rows={5} value={form.credentials.privateKey || ''} onChange={(e) => setCred('privateKey', e.target.value)} className="input font-mono resize-none" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
          </div>
        )}

        <div className="col-span-2">
          <label className="label">Description (optionnel)</label>
          <input value={form.description} onChange={(e) => set('description', e.target.value)} className="input" placeholder="Serveur de production EU" />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="btn-ghost">Annuler</button>
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
          {saving && <Loader2 size={13} className="animate-spin" />}
          {initial ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}

export default function SshServers() {
  const { user } = useAuth();
  const canEdit  = user?.role === 'admin' || user?.role === 'responsable';

  const [servers, setServers]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState(null);
  const [testing, setTesting]         = useState(null);
  const [testResults, setTestResults] = useState({});

  async function load() {
    const { data } = await api.get('/ssh-servers');
    setServers(data); setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(payload)          { await api.post('/ssh-servers', payload); setShowForm(false); load(); }
  async function handleUpdate(id, payload)   { await api.put(`/ssh-servers/${id}`, payload); setEditing(null); load(); }
  async function handleDelete(id)            { if (!confirm('Supprimer ce serveur ?')) return; await api.delete(`/ssh-servers/${id}`); load(); }

  async function handleTest(id) {
    setTesting(id); setTestResults((r) => ({ ...r, [id]: null }));
    try {
      const { data } = await api.post(`/ssh-servers/${id}/test`);
      setTestResults((r) => ({ ...r, [id]: data }));
    } catch (err) {
      setTestResults((r) => ({ ...r, [id]: { ok: false, message: err.response?.data?.error || err.message } }));
    } finally { setTesting(null); }
  }

  return (
    <div className="p-7">
      <div className="page-header">
        <div>
          <h1 className="page-title">Serveurs SSH</h1>
          <p className="page-sub">Carnet d'adresses pour les sauvegardes et restaurations distantes</p>
        </div>
        {canEdit && !showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5">
            <Plus size={14} /> Ajouter
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-5">
          <ServerForm onSave={handleAdd} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="w-6 h-6 border-2 border-ink-500 border-t-brand rounded-full animate-spin mx-auto" />
        </div>
      ) : servers.length === 0 ? (
        <div className="text-center py-16 card">
          <Server size={36} className="mx-auto mb-3 text-ink-400" />
          <p className="text-ink-300 text-sm">Aucun serveur SSH configuré</p>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((s) => (
            <div key={s.id} className="card p-4">
              {editing === s.id ? (
                <ServerForm
                  initial={{ name: s.name, host: s.host, port: String(s.port), username: s.username, auth_type: s.authType, credentials: {}, description: s.description || '' }}
                  onSave={(p) => handleUpdate(s.id, p)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-ink-600 border border-ink-500 rounded-lg">
                      <Server size={16} className="text-brand" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-50">{s.name}</p>
                      <p className="text-xs text-ink-300 font-mono">{s.username}@{s.host}:{s.port}</p>
                      {s.description && <p className="text-xs text-ink-400 mt-0.5">{s.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {testResults[s.id] && (
                      <span className={clsx('flex items-center gap-1 text-xs mr-2', testResults[s.id].ok ? 'text-emerald-400' : 'text-red-400')}>
                        {testResults[s.id].ok ? <><CheckCircle size={13} /> OK</> : <><XCircle size={13} /> Échec</>}
                      </span>
                    )}
                    {canEdit && (
                      <>
                        <button onClick={() => handleTest(s.id)} disabled={testing === s.id} title="Tester" className="p-2 text-ink-300 hover:text-brand disabled:opacity-40 transition-colors rounded-lg hover:bg-ink-600">
                          {testing === s.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        </button>
                        <button onClick={() => setEditing(s.id)} title="Modifier" className="p-2 text-ink-300 hover:text-ink-50 transition-colors rounded-lg hover:bg-ink-600">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(s.id)} title="Supprimer" className="p-2 text-ink-300 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
