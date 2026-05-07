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
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }
  function setCred(field, value) {
    setForm((f) => ({ ...f, credentials: { ...f.credentials, [field]: value } }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name, host: form.host, port: Number(form.port),
        username: form.username, auth_type: form.auth_type,
        credentials: form.credentials, description: form.description,
      };
      await onSave(payload);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-6 bg-slate-800 rounded-xl border border-slate-700">
      <h3 className="text-white font-semibold">{initial ? 'Modifier le serveur' : 'Ajouter un serveur'}</h3>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-slate-400 text-xs mb-1">Nom</label>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            placeholder="Mon serveur de prod" />
        </div>
        <div>
          <label className="block text-slate-400 text-xs mb-1">Hôte</label>
          <input required value={form.host} onChange={(e) => set('host', e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            placeholder="192.168.1.10" />
        </div>
        <div>
          <label className="block text-slate-400 text-xs mb-1">Port</label>
          <input type="number" value={form.port} onChange={(e) => set('port', e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
        </div>
        <div>
          <label className="block text-slate-400 text-xs mb-1">Utilisateur</label>
          <input required value={form.username} onChange={(e) => set('username', e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            placeholder="ubuntu" />
        </div>
        <div>
          <label className="block text-slate-400 text-xs mb-1">Authentification</label>
          <select value={form.auth_type} onChange={(e) => set('auth_type', e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm">
            <option value="password">Mot de passe</option>
            <option value="key">Clé privée</option>
          </select>
        </div>

        {form.auth_type === 'password' ? (
          <div className="col-span-2">
            <label className="block text-slate-400 text-xs mb-1">Mot de passe</label>
            <input type="password" value={form.credentials.password || ''}
              onChange={(e) => setCred('password', e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
        ) : (
          <div className="col-span-2">
            <label className="block text-slate-400 text-xs mb-1">Clé privée (contenu PEM)</label>
            <textarea rows={5} value={form.credentials.privateKey || ''}
              onChange={(e) => setCred('privateKey', e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm font-mono resize-none"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
          </div>
        )}

        <div className="col-span-2">
          <label className="block text-slate-400 text-xs mb-1">Description (optionnel)</label>
          <input value={form.description} onChange={(e) => set('description', e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            placeholder="Serveur de production EU" />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
          Annuler
        </button>
        <button type="submit" disabled={saving}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}
          {initial ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}

export default function SshServers() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'responsable';

  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [testing, setTesting] = useState(null);
  const [testResults, setTestResults] = useState({});

  async function load() {
    const { data } = await api.get('/ssh-servers');
    setServers(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(payload) {
    await api.post('/ssh-servers', payload);
    setShowForm(false);
    await load();
  }

  async function handleUpdate(id, payload) {
    await api.put(`/ssh-servers/${id}`, payload);
    setEditing(null);
    await load();
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer ce serveur ?')) return;
    await api.delete(`/ssh-servers/${id}`);
    await load();
  }

  async function handleTest(id) {
    setTesting(id);
    setTestResults((r) => ({ ...r, [id]: null }));
    try {
      const { data } = await api.post(`/ssh-servers/${id}/test`);
      setTestResults((r) => ({ ...r, [id]: data }));
    } catch (err) {
      setTestResults((r) => ({ ...r, [id]: { ok: false, message: err.response?.data?.error || err.message } }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Serveurs SSH</h1>
          <p className="text-slate-500 text-sm mt-1">Carnet d'adresses pour les sauvegardes distantes</p>
        </div>
        {canEdit && !showForm && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors">
            <Plus size={16} /> Ajouter
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-6">
          <ServerForm onSave={handleAdd} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm">Chargement…</div>
      ) : servers.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Server size={40} className="mx-auto mb-3 opacity-40" />
          <p>Aucun serveur SSH configuré</p>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
              {editing === s.id ? (
                <ServerForm
                  initial={{
                    name: s.name, host: s.host, port: String(s.port),
                    username: s.username, auth_type: s.authType,
                    credentials: {}, description: s.description || '',
                  }}
                  onSave={(payload) => handleUpdate(s.id, payload)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <Server size={18} className="text-slate-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{s.name}</p>
                      <p className="text-sm text-slate-500">{s.username}@{s.host}:{s.port}</p>
                      {s.description && <p className="text-xs text-slate-400 mt-0.5">{s.description}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {testResults[s.id] && (
                      <span className={clsx('flex items-center gap-1 text-xs',
                        testResults[s.id].ok ? 'text-green-600' : 'text-red-500')}>
                        {testResults[s.id].ok
                          ? <><CheckCircle size={14} /> OK</>
                          : <><XCircle size={14} /> Échec</>}
                      </span>
                    )}
                    {canEdit && (
                      <>
                        <button onClick={() => handleTest(s.id)} disabled={testing === s.id}
                          title="Tester la connexion"
                          className="p-2 text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-50">
                          {testing === s.id
                            ? <Loader2 size={16} className="animate-spin" />
                            : <CheckCircle size={16} />}
                        </button>
                        <button onClick={() => setEditing(s.id)} title="Modifier"
                          className="p-2 text-slate-400 hover:text-slate-700 transition-colors">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => handleDelete(s.id)} title="Supprimer"
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
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
