import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Shield, CheckCircle, XCircle, Server, X, Loader2, AlertTriangle } from 'lucide-react';
import { backupsApi, sshServersApi } from '../services/api';

function Field({ label, value }) {
  return (
    <div className="flex px-6 py-3 text-sm border-b border-gray-100 last:border-0">
      <span className="w-44 text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800 break-all font-mono text-xs">{String(value ?? '—')}</span>
    </div>
  );
}

function RestoreRemoteModal({ backup, onClose }) {
  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState('');
  const [destPath, setDestPath] = useState('/tmp/restore');
  const [preservePerms, setPreservePerms] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [fileExistsAt, setFileExistsAt] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    sshServersApi.list().then(({ data }) => {
      setServers(data);
      if (data.length > 0) setSelectedServerId(data[0].id);
    });
  }, []);

  const handleTest = async () => {
    if (!selectedServerId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await sshServersApi.test(selectedServerId);
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, message: 'Erreur de connexion' });
    }
    setTesting(false);
  };

  const doRestore = async (overwrite = false) => {
    setRestoring(true);
    setFileExistsAt(null);
    try {
      const { data } = await backupsApi.restoreRemote(backup.backupId, {
        ssh_server_id: selectedServerId,
        destination_path: destPath,
        preserve_permissions: preservePerms,
        overwrite,
      });
      setResult({ ok: true, ...data });
    } catch (err) {
      const body = err.response?.data;
      if (err.response?.status === 409 && body?.fileExists) {
        setFileExistsAt(body.path);
      } else {
        setResult({ ok: false, error: body?.error || 'Erreur inattendue' });
      }
    }
    setRestoring(false);
  };

  const selectedServer = servers.find((s) => s.id === selectedServerId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Restaurer vers serveur distant</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {result ? (
            result.ok ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600 font-medium">
                  <CheckCircle size={18} />
                  Restauration réussie
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-700 space-y-1">
                  <div><span className="text-gray-400">Destination :</span> {result.destination}</div>
                  <div><span className="text-gray-400">Fichier :</span> {result.fileName}</div>
                  <div><span className="text-gray-400">Taille :</span> {(result.size / 1024).toFixed(1)} Ko</div>
                  {result.decompressed && <div className="text-indigo-600">Archive décompressée automatiquement</div>}
                </div>
                <button
                  onClick={onClose}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-red-600 font-medium">
                  <XCircle size={18} />
                  Erreur de restauration
                </div>
                <p className="text-sm text-gray-600">{result.error}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setResult(null)}
                    className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                  >
                    Réessayer
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            )
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Serveur SSH</label>
                {servers.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun serveur SSH configuré. Ajoutez-en un dans la section SSH.</p>
                ) : (
                  <select
                    value={selectedServerId}
                    onChange={(e) => { setSelectedServerId(e.target.value); setTestResult(null); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.username}@{s.host}:{s.port}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedServer && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTest}
                    disabled={testing}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {testing ? <Loader2 size={13} className="animate-spin" /> : <Server size={13} />}
                    Tester la connexion
                  </button>
                  {testResult && (
                    <span className={`text-xs font-medium flex items-center gap-1 ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                      {testResult.ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
                      {testResult.message}
                    </span>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Répertoire de destination</label>
                <input
                  type="text"
                  value={destPath}
                  onChange={(e) => setDestPath(e.target.value)}
                  placeholder="/home/user/restored"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Le fichier sera créé à : <span className="font-mono">{destPath.replace(/\/$/, '')}/{backup.fileName}</span>
                </p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={preservePerms}
                  onChange={(e) => setPreservePerms(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600"
                />
                <span className="text-sm text-gray-700">Préserver les permissions originales</span>
              </label>

              {fileExistsAt && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2 text-amber-700 text-sm font-medium">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    Le fichier existe déjà à destination
                  </div>
                  <p className="text-xs font-mono text-amber-600">{fileExistsAt}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => doRestore(true)}
                      disabled={restoring}
                      className="flex-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition-colors disabled:opacity-50"
                    >
                      Écraser
                    </button>
                    <button
                      onClick={() => setFileExistsAt(null)}
                      className="flex-1 px-3 py-1.5 border border-amber-200 text-amber-700 rounded-lg text-sm hover:bg-amber-50 transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {!fileExistsAt && (
                <button
                  onClick={() => doRestore(false)}
                  disabled={restoring || !selectedServerId || !destPath}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {restoring ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Restauration en cours…
                    </>
                  ) : (
                    <>
                      <Server size={15} />
                      Restaurer
                    </>
                  )}
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
  const { id } = useParams();
  const navigate = useNavigate();
  const [backup, setBackup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  useEffect(() => {
    backupsApi.get(id)
      .then(({ data }) => setBackup(data))
      .catch(() => navigate('/backups', { replace: true }))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownload = async () => {
    const { data } = await backupsApi.download(id);
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = backup.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleVerify = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await backupsApi.verify(id, formData);
      setVerifyResult(data.valid);
    } catch (_) {
      setVerifyResult(null);
    }
    setVerifying(false);
    e.target.value = '';
  };

  if (loading) return <div className="p-8 text-gray-400 text-sm">Chargement…</div>;
  if (!backup) return null;

  return (
    <div className="p-8 max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors"
      >
        <ArrowLeft size={15} />
        Retour
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1 break-all">{backup.fileName}</h1>
      <p className="text-gray-400 text-xs font-mono mb-6">{backup.backupId}</p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <Field label="Fichier" value={backup.fileName} />
        <Field label="Taille" value={`${backup.fileSize?.toLocaleString()} octets`} />
        <Field label="Type MIME" value={backup.mimeType} />
        <Field label="Hash SHA-256" value={backup.fileHash} />
        <Field label="CID IPFS" value={backup.cid} />
        <Field label="Statut" value={backup.status} />
        <Field label="Organisation" value={backup.ownerMSP} />
        <Field label="Transaction ID" value={backup.txId} />
        <Field label="Date" value={new Date(backup.timestamp).toLocaleString('fr-FR')} />
        <Field label="Vérifications" value={backup.verificationCount} />
        {backup.lastVerification && (
          <Field
            label="Dernière vérif."
            value={`${new Date(backup.lastVerification.timestamp).toLocaleString('fr-FR')} — ${backup.lastVerification.result ? 'OK' : 'Altéré'}`}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
        >
          <Download size={15} />
          Télécharger
        </button>

        <button
          onClick={() => setShowRestoreModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors"
        >
          <Server size={15} />
          Restaurer vers serveur distant
        </button>

        <label className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 cursor-pointer transition-colors">
          <Shield size={15} />
          {verifying ? 'Vérification…' : "Vérifier l'intégrité"}
          <input type="file" className="hidden" onChange={handleVerify} />
        </label>

        {verifyResult === true && (
          <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
            <CheckCircle size={16} /> Intègre
          </span>
        )}
        {verifyResult === false && (
          <span className="flex items-center gap-1.5 text-red-600 text-sm font-medium">
            <XCircle size={16} /> Altéré
          </span>
        )}
      </div>

      {showRestoreModal && (
        <RestoreRemoteModal backup={backup} onClose={() => setShowRestoreModal(false)} />
      )}
    </div>
  );
}
