import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Shield, Upload, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { backupsApi } from '../services/api';

export default function Verify() {
  const [backupId, setBackupId] = useState('');
  const [result, setResult]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({ multiple: false });
  const file = acceptedFiles[0];

  const handleVerify = async () => {
    if (!backupId.trim() || !file) { setError('Entrez un ID de sauvegarde et sélectionnez un fichier.'); return; }
    setError(''); setResult(null); setLoading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await backupsApi.verify(backupId.trim(), fd);
      setResult(data.valid);
    } catch (err) { setError(err.response?.data?.error || 'Erreur lors de la vérification.'); }
    setLoading(false);
  };

  return (
    <div className="p-7 max-w-xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Vérifier l'intégrité</h1>
          <p className="page-sub">Comparez un fichier local avec son empreinte sur la blockchain</p>
        </div>
      </div>

      <div className="card p-6 space-y-5">
        <div>
          <label className="label">ID de sauvegarde</label>
          <input
            type="text" value={backupId} onChange={(e) => setBackupId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="input font-mono"
          />
        </div>

        <div>
          <label className="label">Fichier à vérifier</label>
          <div
            {...getRootProps()}
            className={clsx(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
              isDragActive ? 'border-brand bg-brand/5' : 'border-ink-500 hover:border-ink-400 hover:bg-ink-650',
            )}
          >
            <input {...getInputProps()} />
            <Upload size={22} className={clsx('mx-auto mb-2', isDragActive ? 'text-brand' : 'text-ink-400')} />
            {file ? (
              <p className="text-sm text-brand font-medium">{file.name}</p>
            ) : (
              <p className="text-sm text-ink-300">Glissez un fichier ou cliquez</p>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <XCircle size={14} className="text-red-400 shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={handleVerify}
          disabled={loading || !backupId.trim() || !file}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
          {loading ? 'Vérification en cours…' : 'Vérifier l\'intégrité'}
        </button>

        {result === true && (
          <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <CheckCircle size={18} className="text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-400">Fichier intègre</p>
              <p className="text-ink-200 text-sm mt-0.5">Le hash SHA-256 correspond à l'enregistrement sur la blockchain.</p>
            </div>
          </div>
        )}

        {result === false && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <XCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-400">Fichier altéré</p>
              <p className="text-ink-200 text-sm mt-0.5">Le hash SHA-256 ne correspond pas à l'enregistrement sur la blockchain.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
