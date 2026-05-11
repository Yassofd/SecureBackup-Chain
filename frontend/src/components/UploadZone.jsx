import { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, AlertCircle, Loader2, Lock, Clock, Zap } from 'lucide-react';
import clsx from 'clsx';
import { backupsApi } from '../services/api';

function fmtSize(bytes) {
  if (bytes < 1024)            return `${bytes} o`;
  if (bytes < 1048576)         return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1073741824)      return `${(bytes / 1048576).toFixed(1)} Mo`;
  if (bytes < 1099511627776)   return `${(bytes / 1073741824).toFixed(2)} Go`;
  return `${(bytes / 1099511627776).toFixed(2)} To`;
}

function fmtEta(seconds) {
  if (!isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60)   return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min ${Math.ceil(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}min`;
}

export default function UploadZone({ onSuccess }) {
  const [progress,  setProgress]  = useState(null);   // 0–100
  const [status,    setStatus]    = useState(null);    // null | uploading | success | error
  const [message,   setMessage]   = useState('');
  const [speed,     setSpeed]     = useState(0);       // bytes/s
  const [loaded,    setLoaded]    = useState(0);       // bytes transférés
  const [total,     setTotal]     = useState(0);       // taille fichier
  const [eta,       setEta]       = useState(null);    // secondes restantes
  const startRef  = useRef(null);
  const prevRef   = useRef({ loaded: 0, time: 0 });

  const reset = () => { setProgress(null); setSpeed(0); setLoaded(0); setTotal(0); setEta(null); };

  const onDrop = useCallback(async (files) => {
    if (!files.length) return;
    const file = files[0];
    const fd = new FormData();
    fd.append('file', file);

    setStatus('uploading');
    setProgress(0);
    setMessage('');
    setTotal(file.size);
    startRef.current = Date.now();
    prevRef.current  = { loaded: 0, time: Date.now() };

    try {
      const { data } = await backupsApi.upload(fd, (e) => {
        if (!e.total) return;
        const now     = Date.now();
        const elapsed = (now - startRef.current) / 1000;

        // Vitesse moyenne glissante sur la dernière seconde
        const dt    = (now - prevRef.current.time) / 1000;
        const dl    = e.loaded - prevRef.current.loaded;
        const spd   = dt > 0 ? dl / dt : 0;
        prevRef.current = { loaded: e.loaded, time: now };

        const pct     = Math.round((e.loaded / e.total) * 100);
        const etaSecs = spd > 0 ? (e.total - e.loaded) / spd : Infinity;

        setProgress(pct);
        setLoaded(e.loaded);
        setSpeed(spd);
        setEta(etaSecs);
      });

      setStatus('success');
      setMessage(`ID : ${data.backupId.slice(0, 8)}…`);
      setTimeout(() => { setStatus(null); reset(); }, 5000);
      onSuccess?.();
    } catch (err) {
      setStatus('error');
      setMessage(err.response?.data?.error || "Échec de l'upload");
      reset();
    }
  }, [onSuccess]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: status === 'uploading',
  });

  return (
    <div className="space-y-3">

      {/* Zone de dépôt */}
      <div
        {...getRootProps()}
        className={clsx(
          'relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 overflow-hidden',
          isDragActive  ? 'border-brand scale-[1.01]' : 'border-ink-500/60 hover:border-brand/50',
          status === 'uploading' && 'pointer-events-none opacity-60',
        )}
        style={isDragActive ? {
          background: 'radial-gradient(ellipse at center, rgba(0,180,216,0.10) 0%, rgba(0,180,216,0.04) 60%, transparent 100%)',
          boxShadow:  '0 0 30px rgba(0,180,216,0.18), inset 0 0 20px rgba(0,180,216,0.06)',
        } : {
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.02) 0%, transparent 70%)',
        }}
      >
        <input {...getInputProps()} />

        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4 transition-all duration-200"
          style={isDragActive ? {
            background: 'linear-gradient(135deg, rgba(0,180,216,0.25) 0%, rgba(139,92,246,0.15) 100%)',
            border: '1px solid rgba(0,180,216,0.4)',
            boxShadow: '0 0 20px rgba(0,180,216,0.3)',
          } : {
            background: 'rgba(255,255,255,0.04)',
            border:     '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {status === 'uploading'
            ? <Loader2 size={18} className="text-brand animate-spin" />
            : <Upload  size={18} className={isDragActive ? 'text-brand' : 'text-ink-300'}
                style={isDragActive ? { filter: 'drop-shadow(0 0 6px rgba(0,180,216,0.8))' } : {}} />
          }
        </div>

        <p className="text-sm font-semibold text-ink-100">
          {isDragActive ? 'Relâchez pour sauvegarder…' : 'Glissez un fichier ou cliquez'}
        </p>
        <p className="text-xs text-ink-400 mt-1.5 flex items-center justify-center gap-1.5">
          <Lock size={10} className="text-brand/60" />
          Tout type · Chiffrement AES-256 · Taille illimitée (3 To+)
        </p>
      </div>

      {/* Progression — affichage détaillé pour les gros fichiers */}
      {status === 'uploading' && (
        <div className="space-y-2">
          {/* Barre */}
          <div className="h-1.5 bg-ink-600/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width:      `${progress}%`,
                background: 'linear-gradient(90deg, #007d98, #00b4d8, #4ddce9)',
                boxShadow:  '0 0 8px rgba(0,180,216,0.5)',
              }}
            />
          </div>

          {/* Métriques */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {/* Progression */}
            <div className="bg-ink-800/50 border border-ink-600/40 rounded-lg px-2 py-1.5">
              <p className="text-brand font-mono font-bold text-sm">{progress}%</p>
              <p className="text-ink-400 text-[10px] mt-0.5">
                {fmtSize(loaded)} / {fmtSize(total)}
              </p>
            </div>

            {/* Vitesse */}
            <div className="bg-ink-800/50 border border-ink-600/40 rounded-lg px-2 py-1.5">
              <div className="flex items-center justify-center gap-1">
                <Zap size={10} className="text-amber-400" />
                <p className="text-amber-400 font-mono font-bold text-sm">
                  {speed > 0 ? fmtSize(Math.round(speed)) + '/s' : '—'}
                </p>
              </div>
              <p className="text-ink-400 text-[10px] mt-0.5">Vitesse</p>
            </div>

            {/* ETA */}
            <div className="bg-ink-800/50 border border-ink-600/40 rounded-lg px-2 py-1.5">
              <div className="flex items-center justify-center gap-1">
                <Clock size={10} className="text-purple-400" />
                <p className="text-purple-400 font-mono font-bold text-sm">
                  {eta !== null ? fmtEta(eta) : '—'}
                </p>
              </div>
              <p className="text-ink-400 text-[10px] mt-0.5">Restant</p>
            </div>
          </div>

          <p className="text-xs text-ink-400 text-center">
            Chiffrement AES-256 + transmission vers IPFS Cluster…
          </p>
        </div>
      )}

      {/* Succès */}
      {status === 'success' && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg text-emerald-400 text-sm border border-emerald-500/25 animate-fade-in"
          style={{ background: 'rgba(16,185,129,0.08)', boxShadow: '0 0 12px rgba(16,185,129,0.1)' }}
        >
          <CheckCircle size={14} />
          <span>Sauvegardé — <span className="font-mono text-xs">{message}</span></span>
        </div>
      )}

      {/* Erreur */}
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
