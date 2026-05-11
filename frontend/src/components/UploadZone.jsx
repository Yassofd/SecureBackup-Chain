import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, AlertCircle, Loader2, Lock } from 'lucide-react';
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
          'relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 overflow-hidden',
          isDragActive
            ? 'border-brand scale-[1.01]'
            : 'border-ink-500/60 hover:border-brand/50',
          status === 'uploading' && 'pointer-events-none opacity-60',
        )}
        style={isDragActive ? {
          background: 'radial-gradient(ellipse at center, rgba(0,180,216,0.10) 0%, rgba(0,180,216,0.04) 60%, transparent 100%)',
          boxShadow: '0 0 30px rgba(0,180,216,0.18), inset 0 0 20px rgba(0,180,216,0.06)',
        } : {
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.02) 0%, transparent 70%)',
        }}
      >
        <input {...getInputProps()} />

        {/* Icon */}
        <div
          className={clsx(
            'w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4 transition-all duration-200',
          )}
          style={isDragActive ? {
            background: 'linear-gradient(135deg, rgba(0,180,216,0.25) 0%, rgba(139,92,246,0.15) 100%)',
            border: '1px solid rgba(0,180,216,0.4)',
            boxShadow: '0 0 20px rgba(0,180,216,0.3)',
          } : {
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {status === 'uploading'
            ? <Loader2 size={18} className="text-brand animate-spin" />
            : <Upload size={18} className={isDragActive ? 'text-brand' : 'text-ink-300'} style={isDragActive ? { filter: 'drop-shadow(0 0 6px rgba(0,180,216,0.8))' } : {}} />
          }
        </div>

        <p className="text-sm font-semibold text-ink-100">
          {isDragActive ? 'Relâchez pour sauvegarder…' : 'Glissez un fichier ou cliquez'}
        </p>
        <p className="text-xs text-ink-400 mt-1.5 flex items-center justify-center gap-1.5">
          <Lock size={10} className="text-brand/60" />
          Tout type · Chiffrement AES-256 · Taille illimitée
        </p>
      </div>

      {/* Progress bar */}
      {status === 'uploading' && (
        <div>
          <div className="flex justify-between text-xs text-ink-300 mb-1.5">
            <span>Chiffrement + IPFS Cluster…</span>
            <span className="font-mono text-brand">{progress}%</span>
          </div>
          <div className="h-1 bg-ink-600/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #007d98, #00b4d8, #4ddce9)',
                boxShadow: '0 0 8px rgba(0,180,216,0.5)',
              }}
            />
          </div>
        </div>
      )}

      {/* Success */}
      {status === 'success' && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg text-emerald-400 text-sm border border-emerald-500/25 animate-fade-in"
          style={{ background: 'rgba(16,185,129,0.08)', boxShadow: '0 0 12px rgba(16,185,129,0.1)' }}
        >
          <CheckCircle size={14} />
          <span>Sauvegardé — <span className="font-mono text-xs">{message}</span></span>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg text-red-400 text-sm border border-red-500/25 animate-fade-in"
          style={{ background: 'rgba(239,68,68,0.08)' }}
        >
          <AlertCircle size={14} />
          {message}
        </div>
      )}
    </div>
  );
}
