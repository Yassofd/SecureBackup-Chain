import { useState, useEffect } from 'react';
import api from '../services/api';
import { Server, FolderOpen, CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import clsx from 'clsx';

export default function RemoteBackup() {
  const [servers, setServers]     = useState([]);
  const [form, setForm]           = useState({ serverId: '', remotePath: '' });
  const [testResult, setTest]     = useState(null);
  const [testing, setTesting]     = useState(false);
  const [submitting, setSub]      = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState('');

  useEffect(() => { api.get('/ssh-servers').then(({ data }) => setServers(data)); }, []);

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })); setTest(null); setResult(null); setError(''); }

  async function handleTest() {
    if (!form.serverId) return;
    setTesting(true); setTest(null);
    try {
      const { data } = await api.post(`/ssh-servers/${form.serverId}/test`);
      setTest(data);
    } catch (err) { setTest({ ok: false, message: err.response?.data?.error || err.message }); }
    finally { setTesting(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSub(true); setError(''); setResult(null);
    try {
      const { data } = await api.post('/backups/remote', { serverId: form.serverId, remotePath: form.remotePath });
      setResult(data);
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setSub(false); }
  }

  const selectedServer = servers.find((s) => s.id === form.serverId);

  return (
    <div className="p-7 max-w-xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sauvegarde distante</h1>
          <p className="page-sub">Récupérez un fichier ou dossier depuis un serveur SSH</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Server select */}
        <div>
          <label className="label">Serveur SSH</label>
          {servers.length === 0 ? (
            <p className="text-ink-300 text-sm">Aucun serveur configuré. <a href="/ssh-servers" className="text-brand hover:underline">Ajouter →</a></p>
          ) : (
            <select required value={form.serverId} onChange={(e) => set('serverId', e.target.value)} className="input">
              <option value="">— Sélectionner un serveur —</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.username}@{s.host}:{s.port})</option>
              ))}
            </select>
          )}
        </div>

        {/* Test connection */}
        {form.serverId && (
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleTest} disabled={testing} className="btn-outline flex items-center gap-1.5">
              {testing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              Tester la connexion
            </button>
            {testResult && (
              <span className={clsx('flex items-center gap-1 text-sm', testResult.ok ? 'text-emerald-400' : 'text-red-400')}>
                {testResult.ok ? <><CheckCircle size={13} /> Connexion OK</> : <><XCircle size={13} /> {testResult.message}</>}
              </span>
            )}
          </div>
        )}

        {/* Remote path */}
        <div>
          <label className="label">Chemin distant</label>
          <div className="relative">
            <FolderOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <input required value={form.remotePath} onChange={(e) => set('remotePath', e.target.value)}
              className="input pl-8 font-mono" placeholder="/home/ubuntu/data" />
          </div>
          <p className="text-xs text-ink-300 mt-1">Fichier ou dossier — les dossiers seront compressés en tar.gz</p>
        </div>

        {/* Summary */}
        {selectedServer && form.remotePath && (
          <div className="flex items-center gap-2 text-xs text-ink-200 bg-ink-600 border border-ink-500 rounded-lg p-3">
            <Server size={13} className="text-brand shrink-0" />
            <span className="font-mono truncate">{selectedServer.username}@{selectedServer.host}:{form.remotePath}</span>
            <ArrowRight size={12} className="text-ink-400 shrink-0" />
            <span className="text-brand whitespace-nowrap">IPFS Cluster</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <XCircle size={14} className="text-red-400 shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <button type="submit" disabled={submitting || !form.serverId || !form.remotePath} className="btn-primary w-full flex items-center justify-center gap-2">
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {submitting ? 'Sauvegarde en cours…' : 'Lancer la sauvegarde'}
        </button>
      </form>

      {result && (
        <div className="mt-4 card p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <CheckCircle size={16} /> Sauvegarde réussie
          </div>
          <div className="space-y-2">
            {[
              ['Backup ID', result.backupId],
              ['CID IPFS',  result.cid],
              ['Hash local',   result.localHash],
              ['Hash distant', result.remoteHash],
            ].map(([label, val]) => (
              <div key={label} className="flex items-start gap-2">
                <span className="text-xs text-ink-300 w-24 shrink-0 pt-0.5">{label}</span>
                <code className="text-xs font-mono text-ink-100 break-all">{val}</code>
              </div>
            ))}
            <p className={clsx('text-xs font-medium mt-1 pt-2 border-t border-ink-500',
              result.localHash === result.remoteHash ? 'text-emerald-400' : 'text-amber-400')}>
              {result.localHash === result.remoteHash
                ? '✓ Intégrité vérifiée — hash identique'
                : '⚠ Hash local ≠ hash distant (compression tar.gz normale)'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
