import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Shield, CheckCircle, XCircle } from 'lucide-react';
import { backupsApi } from '../services/api';

function Field({ label, value }) {
  return (
    <div className="flex px-6 py-3 text-sm border-b border-gray-100 last:border-0">
      <span className="w-44 text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800 break-all font-mono text-xs">{String(value ?? '—')}</span>
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
    </div>
  );
}
