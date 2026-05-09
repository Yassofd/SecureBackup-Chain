import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { backupsApi } from '../services/api';

export default function UploadZone({ onSuccess }) {
  const [progress, setProgress] = useState(null);
  const [status,   setStatus]   = useState(null);
  const [message,  setMessage]  = useState('');

  const onDrop = useCallback(async (files) => {
    if (!files.length) return;
    const fd = new FormData();
    fd.append('file', files[0]);
    setStatus('uploading'); setProgress(0); setMessage('');
    try {
      const { data } = await backupsApi.upload(fd, (e) => {
        if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
      });
      setStatus('success');
      setMessage(`ID : ${data.backupId.slice(0, 8)}…`);
      setTimeout(() => { setStatus(null); setProgress(null); }, 4000);
      onSuccess?.();
    } catch (err) {
      setStatus('error');
      setMessage(err.response?.data?.error || "Échec de l'upload");
    }
  }, [onSuccess]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: status === 'uploading',
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
          isDragActive
            ? 'border-brand bg-brand/[0.06] scale-[1.01]'
            : 'border-ink-500 hover:border-brand/50 hover:bg-brand/[0.03]',
          status === 'uploading' && 'pointer-events-none opacity-50',
        )}
      >
        <input {...getInputProps()} />
        <div className={clsx(
          'w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3 transition-colors',
          isDragActive ? 'bg-brand/20 border border-brand/40' : 'bg-ink-600 border border-ink-500',
        )}>
          {status === 'uploading'
            ? <Loader2 size={18} className="text-brand animate-spin" />
            : <Upload size={18} className={isDragActive ? 'text-brand' : 'text-ink-300'} />}
        </div>
        <p className="text-sm font-semibold text-ink-100">
          {isDragActive ? 'Relâchez pour sauvegarder…' : 'Glissez un fichier ou cliquez'}
        </p>
        <p className="text-xs text-ink-400 mt-1">Tout type · Chiffrement AES-256 · Taille illimitée</p>
      </div>

      {status === 'uploading' && (
        <div>
          <div className="flex justify-between text-xs text-ink-300 mb-1.5">
            <span>Chiffrement + IPFS Cluster…</span>
            <span className="font-mono text-brand">{progress}%</span>
          </div>
          <div className="h-1 bg-ink-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm">
          <CheckCircle size={14} />
          <span>Sauvegardé — <span className="font-mono text-xs">{message}</span></span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          <AlertCircle size={14} />
          {message}
        </div>
      )}
    </div>
  );
}
