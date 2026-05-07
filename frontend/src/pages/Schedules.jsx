import { useState, useEffect } from 'react';
import api from '../services/api';
import {
  CalendarClock, Plus, Trash2, Pause, Play, Zap,
  CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, Clock,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const CRON_PRESETS = [
  { label: 'Toutes les heures', value: '0 * * * *' },
  { label: 'Tous les jours à 2h', value: '0 2 * * *' },
  { label: 'Tous les lundis à 3h', value: '0 3 * * 1' },
  { label: 'Le 1er du mois à 4h', value: '0 4 1 * *' },
  { label: 'Toutes les 5 minutes (test)', value: '*/5 * * * *' },
  { label: 'Personnalisé', value: '__custom__' },
];

function NewScheduleForm({ servers, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    sshServerId: '',
    remotePath: '',
    cronPreset: CRON_PRESETS[1].value,
    cronExpression: CRON_PRESETS[1].value,
    retentionDays: 30,
    retentionCount: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handlePreset(value) {
    set('cronPreset', value);
    if (value !== '__custom__') set('cronExpression', value);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: form.name,
        sshServerId: form.sshServerId,
        remotePath: form.remotePath,
        cronExpression: form.cronExpression,
        retentionDays: Number(form.retentionDays),
        retentionCount: form.retentionCount ? Number(form.retentionCount) : null,
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="p-5 bg-slate-800 rounded-xl border border-slate-700 space-y-4">
      <h3 className="text-white font-semibold">Nouvelle planification</h3>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-slate-400 text-xs mb-1">Nom</label>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            placeholder="Sauvegarde prod quotidienne" />
        </div>

        <div className="col-span-2">
          <label className="block text-slate-400 text-xs mb-1">Serveur SSH</label>
          <select required value={form.sshServerId} onChange={(e) => set('sshServerId', e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm">
            <option value="">-- Sélectionner --</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.username}@{s.host})</option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-slate-400 text-xs mb-1">Chemin distant</label>
          <input required value={form.remotePath} onChange={(e) => set('remotePath', e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm font-mono"
            placeholder="/home/ubuntu/data" />
        </div>

        <div className="col-span-2">
          <label className="block text-slate-400 text-xs mb-1">Fréquence</label>
          <select value={form.cronPreset} onChange={(e) => handlePreset(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm mb-2">
            {CRON_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {form.cronPreset === '__custom__' && (
            <input required value={form.cronExpression} onChange={(e) => set('cronExpression', e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm font-mono"
              placeholder="0 2 * * *" />
          )}
          {form.cronPreset !== '__custom__' && (
            <p className="text-slate-500 text-xs font-mono">{form.cronExpression}</p>
          )}
        </div>

        <div>
          <label className="block text-slate-400 text-xs mb-1">Rétention (jours)</label>
          <input type="number" min="1" value={form.retentionDays} onChange={(e) => set('retentionDays', e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
        </div>
        <div>
          <label className="block text-slate-400 text-xs mb-1">Rétention (nb max, optionnel)</label>
          <input type="number" min="1" value={form.retentionCount} onChange={(e) => set('retentionCount', e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            placeholder="ex: 7" />
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
          Créer
        </button>
      </div>
    </form>
  );
}

function RunHistory({ scheduleId }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/schedules/${scheduleId}/history`)
      .then(({ data }) => setRuns(data))
      .finally(() => setLoading(false));
  }, [scheduleId]);

  if (loading) return <div className="text-slate-400 text-xs p-3">Chargement…</div>;
  if (runs.length === 0) return <div className="text-slate-400 text-xs p-3">Aucune exécution enregistrée</div>;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 space-y-1">
      {runs.map((r) => (
        <div key={r.id} className="flex items-center gap-3 text-xs text-slate-500">
          {r.status === 'success'
            ? <CheckCircle size={12} className="text-green-500 shrink-0" />
            : r.status === 'running'
              ? <Loader2 size={12} className="text-blue-500 animate-spin shrink-0" />
              : <XCircle size={12} className="text-red-500 shrink-0" />}
          <span className="w-32 shrink-0">{r.startedAt ? new Date(r.startedAt).toLocaleString('fr-FR') : '—'}</span>
          {r.status === 'success' && r.backupId && (
            <span className="font-mono text-slate-400 truncate">{r.backupId}</span>
          )}
          {r.status === 'error' && (
            <span className="text-red-400 truncate">{r.errorMessage}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Schedules() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'responsable';

  const [schedules, setSchedules] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [acting, setActing] = useState({});

  async function load() {
    const [{ data: sched }, { data: srv }] = await Promise.all([
      api.get('/schedules'),
      api.get('/ssh-servers'),
    ]);
    setSchedules(sched);
    setServers(srv);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(payload) {
    await api.post('/schedules', payload);
    setShowForm(false);
    await load();
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer cette planification ?')) return;
    await api.delete(`/schedules/${id}`);
    await load();
  }

  async function handleAction(id, action) {
    setActing((a) => ({ ...a, [id]: action }));
    try {
      await api.post(`/schedules/${id}/${action}`);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setActing((a) => ({ ...a, [id]: null }));
    }
  }

  function toggleExpand(id) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  const statusBadge = (s) => {
    if (s === 'active') return <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Actif</span>;
    if (s === 'paused') return <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Pausé</span>;
    return <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{s}</span>;
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Planifications</h1>
          <p className="text-slate-500 text-sm mt-1">Sauvegardes récurrentes automatisées</p>
        </div>
        {canEdit && !showForm && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors">
            <Plus size={16} /> Nouvelle planification
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-6">
          <NewScheduleForm servers={servers} onSave={handleSave} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm">Chargement…</div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CalendarClock size={40} className="mx-auto mb-3 opacity-40" />
          <p>Aucune planification configurée</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-slate-100 rounded-lg shrink-0">
                    <CalendarClock size={18} className="text-slate-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-800">{s.name}</p>
                      {statusBadge(s.status)}
                      {s.lastStatus === 'error' && (
                        <span className="text-xs text-red-500 flex items-center gap-1">
                          <XCircle size={12} /> Dernière exécution en erreur
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 truncate">
                      {s.sshServer
                        ? `${s.sshServer.username}@${s.sshServer.host}:${s.remotePath}`
                        : s.remotePath}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                      <span className="font-mono">{s.cronExpression}</span>
                      {s.lastRun && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {new Date(s.lastRun).toLocaleString('fr-FR')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-3">
                  {canEdit && (
                    <>
                      {s.status === 'active' ? (
                        <button onClick={() => handleAction(s.id, 'pause')}
                          disabled={!!acting[s.id]}
                          title="Mettre en pause"
                          className="p-2 text-slate-400 hover:text-amber-500 transition-colors disabled:opacity-50">
                          {acting[s.id] === 'pause'
                            ? <Loader2 size={16} className="animate-spin" />
                            : <Pause size={16} />}
                        </button>
                      ) : (
                        <button onClick={() => handleAction(s.id, 'resume')}
                          disabled={!!acting[s.id]}
                          title="Reprendre"
                          className="p-2 text-slate-400 hover:text-green-600 transition-colors disabled:opacity-50">
                          {acting[s.id] === 'resume'
                            ? <Loader2 size={16} className="animate-spin" />
                            : <Play size={16} />}
                        </button>
                      )}
                      <button onClick={() => handleAction(s.id, 'run-now')}
                        disabled={!!acting[s.id]}
                        title="Exécuter maintenant"
                        className="p-2 text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-50">
                        {acting[s.id] === 'run-now'
                          ? <Loader2 size={16} className="animate-spin" />
                          : <Zap size={16} />}
                      </button>
                      <button onClick={() => handleDelete(s.id)} title="Supprimer"
                        className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  <button onClick={() => toggleExpand(s.id)} title="Historique"
                    className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                    {expanded[s.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {expanded[s.id] && <RunHistory scheduleId={s.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
