import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Shield, CheckCircle, XCircle, Server, X, Loader2, AlertTriangle } from 'lucide-react';
import { backupsApi, sshServersApi } from '../services/api';

function Field({ label, value }) {
  return (
    <div className="flex px-5 py-3 text-sm border-b border-ink-600 last:border-0">
      <span className="w-40 text-ink-300 shrink-0 text-xs pt-0.5">{label}</span>
      <span className="text-ink-100 break-all font-mono text-xs">{String(value ?? '—')}</span>
    </div>
  );
}

function RestoreRemoteModal({ backup, onClose }) {
  const [servers, setServers]       = useState([]);
  const [selId, setSelId]           = useState('');
  const [destPath, setDestPath]     = useState('/tmp/restore');
  const [preservePerms, setPerms]   = useState(false);
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [restoring, setRestoring]   = useState(false);
  const [fileExistsAt, setExists]   = useState(null);
  const [result, setResult]         = useState(null);

  useEffect(() => {
    sshServersApi.list().then(({ data }) => {
      setServers(data);
      if (data.length > 0) setSelId(data[0].id);
    });
  }, []);

  const handleTest = async () => {
    if (!selId) return;
    setTesting(true); setTestResult(null);
    try { const { data } = await sshServersApi.test(selId); setTestResult(data); }
    catch { setTestResult({ ok: false, message: 'Erreur de connexion' }); }
    setTesting(false);
  };

  const doRestore = async (overwrite = false) => {
    setRestoring(true); setExists(null);
    try {
      const { data } = await backupsApi.restoreRemote(backup.backupId, { ssh_server_id: selId, destination_path: destPath, preserve_permissions: preservePerms, overwrite });
      setResult({ ok: true, ...data });
    } catch (err) {
      const body = err.response?.data;
      if (err.response?.status === 409 && body?.fileExists) setExists(body.path);
      else setResult({ ok: false, error: body?.error || 'Erreur inattendue' });
    }
    setRestoring(false);
  };

  const selectedServer = servers.find((s) => s.id === selId);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-ink-700 border border-ink-500 rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-500">
          <h2 className="text-sm font-semibold text-ink-50">Restaurer vers serveur distant</h2>
          <button onClick={onClose} className="p-1.5 text-ink-300 hover:text-ink-50 hover:bg-ink-600 rounded-lg transition-colors"><X size={15} /></button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {result ? (
            result.ok ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm"><CheckCircle size={16} />Restauration réussie</div>
                <div className="bg-ink-600 border border-ink-500 rounded-lg p-3 text-xs font-mono text-ink-200 space-y-1">
                  <div><span className="text-ink-400">Destination :</span> {result.destination}</div>
                  <div><span className="text-ink-400">Fichier :</span> {result.fileName}</div>
                  <div><span className="text-ink-400">Taille :</span> {(result.size / 1024).toFixed(1)} Ko</div>
                  {result.decompressed && <div className="text-brand">Archive décompressée automatiquement</div>}
                </div>
                <button onClick={onClose} className="w-full btn-ghost">Fermer</button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-red-400 font-medium text-sm"><XCircle size={16} />Erreur de restauration</div>
                <p className="text-sm text-ink-200">{result.error}</p>
                <div className="flex gap-2">
                  <button onClick={() => setResult(null)} className="flex-1 btn-outline">Réessayer</button>
                  <button onClick={onClose} className="flex-1 btn-ghost">Fermer</button>
                </div>
              </div>
            )
          ) : (
            <>
              <div>
                <label className="label">Serveur SSH</label>
                {servers.length === 0 ? (
                  <p className="text-ink-300 text-sm">Aucun serveur configuré.</p>
                ) : (
                  <select value={selId} onChange={(e) => { setSelId(e.target.value); setTestResult(null); }} className="input">
                    {servers.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.username}@{s.host}:{s.port}</option>)}
                  </select>
                )}
              </div>

              {selectedServer && (
                <div className="flex items-center gap-2">
                  <button onClick={handleTest} disabled={testing} className="btn-outline flex items-center gap-1.5 text-xs">
                    {testing ? <Loader2 size={12} className="animate-spin" /> : <Server size={12} />} Tester
                  </button>
                  {testResult && (
                    <span className={`text-xs flex items-center gap-1 ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                      {testResult.ok ? <CheckCircle size={12} /> : <XCircle size={12} />} {testResult.message}
                    </span>
                  )}
                </div>
              )}

              <div>
                <label className="label">Répertoire de destination</label>
                <input type="text" value={destPath} onChange={(e) => setDestPath(e.target.value)} placeholder="/home/user/restored" className="input font-mono" />
                <p className="text-xs text-ink-400 mt-1">Fichier : <span className="font-mono">{destPath.replace(/\/$/, '')}/{backup.fileName}</span></p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={preservePerms} onChange={(e) => setPerms(e.target.checked)} className="rounded border-ink-400 bg-ink-600 text-brand" />
                <span className="text-sm text-ink-200">Préserver les permissions originales</span>
              </label>

              {fileExistsAt && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2 text-amber-400 text-sm font-medium">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" /> Le fichier existe déjà à destination
                  </div>
                  <p className="text-xs font-mono text-amber-400/80">{fileExistsAt}</p>
                  <div className="flex gap-2">
                    <button onClick={() => doRestore(true)} disabled={restoring} className="flex-1 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg text-sm hover:bg-amber-500/30 transition-colors disabled:opacity-50">Écraser</button>
                    <button onClick={() => setExists(null)} className="flex-1 btn-ghost text-xs">Annuler</button>
                  </div>
                </div>
              )}

              {!fileExistsAt && (
                <button onClick={() => doRestore(false)} disabled={restoring || !selId || !destPath} className="btn-primary w-full flex items-center justify-center gap-2">
                  {restoring ? <><Loader2 size={14} className="animate-spin" />Restauration en cours…</> : <><Server size={14} />Restaurer</>}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BackupDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const [backup, setBackup]             = useState(null);
  const [loading, setLoading]           = useState(true);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying]       = useState(false);
  const [showRestoreModal, setModal]    = useState(false);

  useEffect(() => {
    backupsApi.get(id)
      .then(({ data }) => setBackup(data))
      .catch(() => navigate('/backups', { replace: true }))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownload = async () => {
    const { data } = await backupsApi.download(id);
    const url = URL.createObjectURL(data);
    const a = document.createElement('a'); a.href = url; a.download = backup.fileName; a.click();
    URL.revokeObjectURL(url);
  };

  const handleVerify = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setVerifying(true); setVerifyResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await backupsApi.verify(id, fd);
      setVerifyResult(data.valid);
    } catch (_) {}
    setVerifying(false);
    e.target.value = '';
  };

  if (loading) return (
    <div className="p-7 flex items-center gap-3 text-ink-300 text-sm">
      <div className="w-5 h-5 border-2 border-ink-500 border-t-brand rounded-full animate-spin" /> Chargement…
    </div>
  );
  if (!backup) return null;

  return (
    <div className="p-7 max-w-2xl">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-50 mb-5 transition-colors">
        <ArrowLeft size={14} /> Retour
      </button>

      <h1 className="text-lg font-semibold text-ink-50 mb-0.5 break-all">{backup.fileName}</h1>
      <p className="text-ink-400 text-xs font-mono mb-5">{backup.backupId}</p>

      <div className="card overflow-hidden mb-5">
        <Field label="Fichier"        value={backup.fileName} />
        <Field label="Taille"         value={`${backup.fileSize?.toLocaleString()} octets`} />
        <Field label="Type MIME"      value={backup.mimeType} />
        <Field label="Hash SHA-256"   value={backup.fileHash} />
        <Field label="CID IPFS"       value={backup.cid} />
        <Field label="Statut"         value={backup.status} />
        <Field label="Organisation"   value={backup.ownerMSP} />
        <Field label="Transaction ID" value={backup.txId} />
        <Field label="Date"           value={new Date(backup.timestamp).toLocaleString('fr-FR')} />
        <Field label="Vérifications"  value={backup.verificationCount} />
        {backup.lastVerification && (
          <Field label="Dernière vérif." value={`${new Date(backup.lastVerification.timestamp).toLocaleString('fr-FR')} — ${backup.lastVerification.result ? 'OK' : 'Altéré'}`} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={handleDownload} className="btn-primary flex items-center gap-1.5">
          <Download size={13} /> Télécharger
        </button>

        <button onClick={() => setModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 rounded-lg text-sm font-medium transition-colors">
          <Server size={13} /> Restaurer vers serveur distant
        </button>

        <label className="btn-outline flex items-center gap-1.5 cursor-pointer">
          <Shield size={13} />
          {verifying ? 'Vérification…' : "Vérifier l'intégrité"}
          <input type="file" className="hidden" onChange={handleVerify} />
        </label>

        {verifyResult === true && (
          <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium badge-green">
            <CheckCircle size={13} /> Intègre
          </span>
        )}
        {verifyResult === false && (
          <span className="flex items-center gap-1.5 text-red-400 text-sm font-medium badge-red">
            <XCircle size={13} /> Altéré
          </span>
        )}
      </div>

      {showRestoreModal && <RestoreRemoteModal backup={backup} onClose={() => setModal(false)} />}
    </div>
  );
}
