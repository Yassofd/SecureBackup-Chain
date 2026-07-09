import { useState, useEffect } from 'react';
import api from '../services/api';
import { CalendarClock, Plus, Trash2, Pause, Play, Zap, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, Clock, Server, HardDriveDownload } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const CRON_PRESETS = [
  { label: 'Toutes les heures',      value: '0 * * * *' },
  { label: 'Tous les jours à 2h',    value: '0 2 * * *' },
  { label: 'Tous les lundis à 3h',   value: '0 3 * * 1' },
  { label: 'Le 1er du mois à 4h',    value: '0 4 1 * *' },
  { label: 'Toutes les 5 min (test)',value: '*/5 * * * *' },
  { label: 'Personnalisé',           value: '__custom__' },
];

function NewScheduleForm({ sshServers, sftpServers, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '', serverType: 'ssh', sshServerId: '', sftpServerId: '', remotePath: '',
    cronPreset: CRON_PRESETS[1].value, cronExpression: CRON_PRESETS[1].value,
    retentionDays: 30, retentionCount: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (f, v) => setForm((x) => ({ ...x, [f]: v }));

  function handlePreset(v) {
    set('cronPreset', v);
    if (v !== '__custom__') set('cronExpression', v);
  }

  async function submit(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const payload = {
        name: form.name,
        remotePath: form.remotePath,
        cronExpression: form.cronExpression,
        retentionDays: Number(form.retentionDays),
        retentionCount: form.retentionCount ? Number(form.retentionCount) : null,
      };
      if (form.serverType === 'sftp') payload.sftpServerId = form.sftpServerId;
      else payload.sshServerId = form.sshServerId;
      await onSave(payload);
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-ink-50">Nouvelle planification</h3>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Nom</label>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} className="input" placeholder="Sauvegarde prod quotidienne" />
        </div>

        {/* Sélecteur type SSH / SFTP */}
        <div className="col-span-2">
          <label className="label">Type de connexion</label>
          <div className="flex gap-2">
            {[['ssh','SSH', Server], ['sftp','SFTP', HardDriveDownload]].map(([val, label, Icon]) => (
              <button
                key={val} type="button"
                onClick={() => set('serverType', val)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                  form.serverType === val
                    ? 'bg-brand/15 border-brand/40 text-brand'
                    : 'bg-ink-700 border-ink-500 text-ink-300 hover:border-ink-400',
                )}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <label className="label">Serveur {form.serverType.toUpperCase()}</label>
          {form.serverType === 'ssh' ? (
            <select required value={form.sshServerId} onChange={(e) => set('sshServerId', e.target.value)} className="input">
              <option value="">— Sélectionner un serveur SSH —</option>
              {sshServers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.username}@{s.host})</option>)}
            </select>
          ) : (
            <select required value={form.sftpServerId} onChange={(e) => set('sftpServerId', e.target.value)} className="input">
              <option value="">— Sélectionner un serveur SFTP —</option>
              {sftpServers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.username}@{s.host})</option>)}
            </select>
          )}
        </div>
        <div className="col-span-2">
          <label className="label">Chemin distant</label>
          <input required value={form.remotePath} onChange={(e) => set('remotePath', e.target.value)} className="input font-mono" placeholder="/home/ubuntu/data" />
        </div>
        <div className="col-span-2">
          <label className="label">Fréquence</label>
          <select value={form.cronPreset} onChange={(e) => handlePreset(e.target.value)} className="input mb-2">
            {CRON_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {form.cronPreset === '__custom__' ? (
            <input required value={form.cronExpression} onChange={(e) => set('cronExpression', e.target.value)} className="input font-mono" placeholder="0 2 * * *" />
          ) : (
            <p className="text-ink-400 text-xs font-mono">{form.cronExpression}</p>
          )}
        </div>
        <div>
          <label className="label">Rétention (jours)</label>
          <input type="number" min="1" value={form.retentionDays} onChange={(e) => set('retentionDays', e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Nb max (optionnel)</label>
          <input type="number" min="1" value={form.retentionCount} onChange={(e) => set('retentionCount', e.target.value)} className="input" placeholder="ex: 7" />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-ghost">Annuler</button>
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
          {saving && <Loader2 size={13} className="animate-spin" />} Créer
        </button>
      </div>
    </form>
  );
}

function RunHistory({ scheduleId }) {
  const [runs, setRuns]     = useState([]);
  const [loading, setLoad]  = useState(true);

  useEffect(() => {
    api.get(`/schedules/${scheduleId}/history`).then(({ data }) => setRuns(data)).finally(() => setLoad(false));
  }, [scheduleId]);

  if (loading) return <div className="text-ink-300 text-xs px-4 py-3">Chargement…</div>;
  if (runs.length === 0) return <div className="text-ink-400 text-xs px-4 py-3">Aucune exécution enregistrée</div>;

  return (
    <div className="mt-3 border-t border-ink-600 pt-3 space-y-1.5 px-4 pb-2">
      {runs.map((r) => (
        <div key={r.id} className="flex items-center gap-3 text-xs text-ink-300">
          {r.status === 'success' ? <CheckCircle size={11} className="text-emerald-400 shrink-0" />
            : r.status === 'running' ? <Loader2 size={11} className="text-brand animate-spin shrink-0" />
            : <XCircle size={11} className="text-red-400 shrink-0" />}
          <span className="w-32 shrink-0 font-mono">{r.startedAt ? new Date(r.startedAt).toLocaleString('fr-FR') : '—'}</span>
          {r.status === 'success' && r.backupId && <span className="font-mono text-ink-400 truncate">{r.backupId}</span>}
          {r.status === 'error' && <span className="text-red-400 truncate">{r.errorMessage}</span>}
        </div>
      ))}
    </div>
  );
}

export default function Schedules() {
  const { user } = useAuth();
  const canEdit  = user?.role === 'admin' || user?.role === 'responsable';

  const [schedules, setSched]     = useState([]);
  const [sshServers, setSsh]      = useState([]);
  const [sftpServers, setSftp]    = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [expanded, setExpanded]   = useState({});
  const [acting, setActing]       = useState({});

  async function load() {
    const [{ data: sched }, { data: ssh }, { data: sftp }] = await Promise.all([
      api.get('/schedules'), api.get('/ssh-servers'), api.get('/sftp-servers'),
    ]);
    setSched(sched); setSsh(ssh); setSftp(sftp); setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(payload)   { await api.post('/schedules', payload); setShowForm(false); load(); }
  async function handleDelete(id)      { if (!confirm('Supprimer cette planification ?')) return; await api.delete(`/schedules/${id}`); load(); }

  async function handleAction(id, action) {
    setActing((a) => ({ ...a, [id]: action }));
    try { await api.post(`/schedules/${id}/${action}`); await load(); }
    catch (err) { alert(err.response?.data?.error || err.message); }
    finally { setActing((a) => ({ ...a, [id]: null })); }
  }

  const statusBadge = (s) => {
    if (s === 'active') return <span className="badge-green">Actif</span>;
    if (s === 'paused') return <span className="badge-amber">Pausé</span>;
    return <span className="badge-blue">{s}</span>;
  };

  return (
    <div className="p-7">
      <div className="page-header">
        <div>
          <h1 className="page-title">Planifications</h1>
          <p className="page-sub">Sauvegardes récurrentes automatisées via SSH ou SFTP</p>
        </div>
        {canEdit && !showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5">
            <Plus size={14} /> Nouvelle planification
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-5">
          <NewScheduleForm sshServers={sshServers} sftpServers={sftpServers} onSave={handleSave} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12"><div className="w-6 h-6 border-2 border-ink-500 border-t-brand rounded-full animate-spin mx-auto" /></div>
      ) : schedules.length === 0 ? (
        <div className="card text-center py-16">
          <CalendarClock size={36} className="mx-auto mb-3 text-ink-400" />
          <p className="text-ink-300 text-sm">Aucune planification configurée</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <div key={s.id} className="card">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-ink-600 border border-ink-500 rounded-lg shrink-0">
                    <CalendarClock size={15} className="text-brand" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-ink-50">{s.name}</p>
                      {statusBadge(s.status)}
                      <span className={clsx(
                        'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold border',
                        s.serverType === 'sftp'
                          ? 'text-brand bg-brand/10 border-brand/20'
                          : 'text-ink-300 bg-ink-600 border-ink-500',
                      )}>
                        {s.serverType === 'sftp' ? <HardDriveDownload size={9} /> : <Server size={9} />}
                        {s.serverType?.toUpperCase() || 'SSH'}
                      </span>
                      {s.lastStatus === 'error' && (
                        <span className="text-xs text-red-400 flex items-center gap-1"><XCircle size={11} /> Dernière erreur</span>
                      )}
                    </div>
                    <p className="text-xs text-ink-300 truncate font-mono mt-0.5">
                      {s.serverType === 'sftp' && s.sftpServer
                        ? `${s.sftpServer.username}@${s.sftpServer.host}:${s.remotePath}`
                        : s.sshServer
                          ? `${s.sshServer.username}@${s.sshServer.host}:${s.remotePath}`
                          : s.remotePath}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-ink-400">
                      <span className="font-mono">{s.cronExpression}</span>
                      {s.lastRun && (
                        <span className="flex items-center gap-1"><Clock size={10} />{new Date(s.lastRun).toLocaleString('fr-FR')}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0 ml-3">
                  {canEdit && (
                    <>
                      {s.status === 'active' ? (
                        <button onClick={() => handleAction(s.id, 'pause')} disabled={!!acting[s.id]} title="Pause" className="p-2 text-ink-300 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-40">
                          {acting[s.id] === 'pause' ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
                        </button>
                      ) : (
                        <button onClick={() => handleAction(s.id, 'resume')} disabled={!!acting[s.id]} title="Reprendre" className="p-2 text-ink-300 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-40">
                          {acting[s.id] === 'resume' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                        </button>
                      )}
                      <button onClick={() => handleAction(s.id, 'run-now')} disabled={!!acting[s.id]} title="Exécuter maintenant" className="p-2 text-ink-300 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors disabled:opacity-40">
                        {acting[s.id] === 'run-now' ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                      </button>
                      <button onClick={() => handleDelete(s.id)} title="Supprimer" className="p-2 text-ink-300 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                  <button onClick={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))} title="Historique" className="p-2 text-ink-300 hover:text-ink-50 hover:bg-ink-600 rounded-lg transition-colors">
                    {expanded[s.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
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
