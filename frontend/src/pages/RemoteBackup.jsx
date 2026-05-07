import { useState, useEffect } from 'react';
import api from '../services/api';
import { Server, FolderOpen, CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import clsx from 'clsx';

export default function RemoteBackup() {
  const [servers, setServers] = useState([]);
  const [form, setForm] = useState({ serverId: '', remotePath: '' });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/ssh-servers').then(({ data }) => setServers(data));
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setTestResult(null);
    setResult(null);
    setError('');
  }

  async function handleTest() {
    if (!form.serverId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post(`/ssh-servers/${form.serverId}/test`);
      setTestResult(data);
    } catch (err) {
      setTestResult({ ok: false, message: err.response?.data?.error || err.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.serverId || !form.remotePath) return;
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.post('/backups/remote', {
        serverId: form.serverId,
        remotePath: form.remotePath,
      });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedServer = servers.find((s) => s.id === form.serverId);

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Sauvegarde distante</h1>
        <p className="text-slate-500 text-sm mt-1">Récupérez un fichier ou dossier depuis un serveur SSH</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Sélection du serveur */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Serveur SSH</label>
          {servers.length === 0 ? (
            <p className="text-slate-400 text-sm">
              Aucun serveur configuré.{' '}
              <a href="/ssh-servers" className="text-indigo-600 hover:underline">Ajouter un serveur</a>
            </p>
          ) : (
            <select
              required
              value={form.serverId}
              onChange={(e) => set('serverId', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- Sélectionner un serveur --</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.username}@{s.host}:{s.port})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Bouton test connexion */}
        {form.serverId && (
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleTest} disabled={testing}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              {testing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Tester la connexion
            </button>
            {testResult && (
              <span className={clsx('flex items-center gap-1 text-sm',
                testResult.ok ? 'text-green-600' : 'text-red-500')}>
                {testResult.ok
                  ? <><CheckCircle size={14} /> Connexion réussie</>
                  : <><XCircle size={14} /> {testResult.message}</>}
              </span>
            )}
          </div>
        )}

        {/* Chemin distant */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Chemin distant</label>
          <div className="relative">
            <FolderOpen size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              required
              value={form.remotePath}
              onChange={(e) => set('remotePath', e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="/home/ubuntu/data"
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">Fichier ou dossier. Les dossiers seront compressés en tar.gz.</p>
        </div>

        {/* Résumé */}
        {selectedServer && form.remotePath && (
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-lg p-3">
            <Server size={14} className="text-slate-400 shrink-0" />
            <span className="font-mono">{selectedServer.username}@{selectedServer.host}:{form.remotePath}</span>
            <ArrowRight size={14} className="text-slate-400 shrink-0" />
            <span>IPFS + Fabric</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
            <XCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting || !form.serverId || !form.remotePath}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
          {submitting ? 'Sauvegarde en cours…' : 'Lancer la sauvegarde'}
        </button>
      </form>

      {/* Résultat */}
      {result && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-green-700 font-semibold">
            <CheckCircle size={18} />
            Sauvegarde réussie
          </div>
          <div className="text-sm text-slate-600 space-y-1">
            <div><span className="text-slate-400">Backup ID :</span> <code className="font-mono">{result.backupId}</code></div>
            <div><span className="text-slate-400">CID IPFS :</span> <code className="font-mono break-all">{result.cid}</code></div>
            <div><span className="text-slate-400">Hash local :</span> <code className="font-mono text-xs break-all">{result.localHash}</code></div>
            <div><span className="text-slate-400">Hash distant :</span> <code className="font-mono text-xs break-all">{result.remoteHash}</code></div>
            <div className={clsx('text-xs font-medium mt-1',
              result.localHash === result.remoteHash ? 'text-green-600' : 'text-amber-600')}>
              {result.localHash === result.remoteHash
                ? 'Intégrité vérifiée — hash identique'
                : 'Attention : le hash local diffère du hash distant (compression tar.gz)'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
