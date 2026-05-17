import { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, AlertCircle, Loader2, Lock, Clock, Zap, Pause, Play, X } from 'lucide-react';
import clsx from 'clsx';
import api from '../services/api';

const CHUNK_SIZE      = 5 * 1024 * 1024;   // 5 Mo par requête (résistant au timeout tunnel)
const CHUNK_THRESHOLD = 20 * 1024 * 1024;  // chunked pour fichiers > 20 Mo

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
  const [progress,  setProgress]  = useState(null);
  const [status,    setStatus]    = useState(null);
  const [message,   setMessage]   = useState('');
  const [speed,     setSpeed]     = useState(0);
  const [loaded,    setLoaded]    = useState(0);
  const [total,     setTotal]     = useState(0);
  const [eta,       setEta]       = useState(null);
  const [paused,    setPaused]    = useState(false);
  const [chunked,   setChunked]   = useState(false); // true = upload chunked en cours

  const startRef     = useRef(null);
  const prevRef      = useRef({ loaded: 0, time: 0 });
  const abortCtrlRef = useRef(null);   // AbortController du chunk en cours
  const pausedRef    = useRef(false);  // état pause synchrone pour la boucle
  const resumeFnRef  = useRef(null);   // resolve() qui débloque la pause

  const reset = useCallback(() => {
    setProgress(null); setSpeed(0); setLoaded(0);
    setTotal(0); setEta(null); setPaused(false); setChunked(false);
    pausedRef.current  = false;
    resumeFnRef.current = null;
  }, []);

  const updateProgress = useCallback((bytesLoaded, bytesTotal) => {
    const now = Date.now();
    const dt  = (now - prevRef.current.time) / 1000;
    const dl  = bytesLoaded - prevRef.current.loaded;
    const spd = dt > 0.05 ? dl / dt : 0;
    prevRef.current = { loaded: bytesLoaded, time: now };

    const pct     = Math.round((bytesLoaded / bytesTotal) * 100);
    const etaSecs = spd > 0 ? (bytesTotal - bytesLoaded) / spd : Infinity;
    setProgress(pct);
    setLoaded(bytesLoaded);
    setSpeed(spd);
    setEta(etaSecs);
  }, []);

  const handleCancel = useCallback(() => {
    abortCtrlRef.current?.abort();
    // Débloquer la pause si on annule pendant une pause
    pausedRef.current = false;
    resumeFnRef.current?.();
    resumeFnRef.current = null;
    setStatus(null);
    setMessage('');
    reset();
  }, [reset]);

  const handlePauseResume = useCallback(() => {
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
      // Réinitialiser le timer pour ne pas fausser la vitesse
      prevRef.current = { ...prevRef.current, time: Date.now() };
      resumeFnRef.current?.();
      resumeFnRef.current = null;
    } else {
      pausedRef.current = true;
      setPaused(true);
      setSpeed(0);
      setEta(null);
    }
  }, []);

  const onDrop = useCallback(async (files) => {
    if (!files.length) return;
    const file = files[0];

    setStatus('uploading');
    setProgress(0);
    setMessage('');
    setTotal(file.size);
    setPaused(false);
    pausedRef.current  = false;
    resumeFnRef.current = null;
    startRef.current   = Date.now();
    prevRef.current    = { loaded: 0, time: Date.now() };

    try {
      let data;

      if (file.size > CHUNK_THRESHOLD) {
        setChunked(true);
        const uploadId    = crypto.randomUUID();
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        let bytesUploaded = 0;
        let cancelled     = false;

        for (let i = 0; i < totalChunks; i++) {
          // Attendre si l'utilisateur a mis en pause
          if (pausedRef.current) {
            await new Promise(resolve => { resumeFnRef.current = resolve; });
          }

          // Vérifier si annulé pendant la pause
          if (abortCtrlRef.current?.signal.aborted) { cancelled = true; break; }

          const start = i * CHUNK_SIZE;
          const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));

          const ctrl = new AbortController();
          abortCtrlRef.current = ctrl;

          try {
            const resp = await api.post(`/backups/chunks/${uploadId}`, chunk, {
              signal: ctrl.signal,
              headers: {
                'Content-Type':   'application/octet-stream',
                'x-chunk-index':  String(i),
                'x-total-chunks': String(totalChunks),
                'x-filename':     encodeURIComponent(file.name),
                'x-mime-type':    file.type || 'application/octet-stream',
              },
              timeout: 120000,
              onUploadProgress: (e) => {
                updateProgress(bytesUploaded + (e.loaded || 0), file.size);
              },
            });
            bytesUploaded += chunk.size;
            data = resp.data;
          } catch (err) {
            if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
              cancelled = true; break;
            }
            throw err;
          }
        }

        if (cancelled) { setStatus(null); reset(); return; }

      } else {
        // Upload direct (fichiers ≤ 20 Mo) — pas de pause possible mid-request
        const ctrl = new AbortController();
        abortCtrlRef.current = ctrl;
        const fd = new FormData();
        fd.append('file', file);

        try {
          const resp = await api.post('/backups', fd, {
            signal: ctrl.signal,
            onUploadProgress: (e) => {
              if (e.total) updateProgress(e.loaded, e.total);
            },
          });
          data = resp.data;
        } catch (err) {
          if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
            setStatus(null); reset(); return;
          }
          throw err;
        }
      }

      setStatus('success');
      setMessage(`ID : ${data.backupId.slice(0, 8)}…`);
      setTimeout(() => { setStatus(null); reset(); }, 5000);
      onSuccess?.();
    } catch (err) {
      setStatus('error');
      const msg = err.response?.data?.error
        || (err.code === 'ERR_NETWORK' || !err.response ? 'Erreur réseau — vérifiez votre connexion et réessayez' : null)
        || `Erreur ${err.response?.status} — réessayez`;
      setMessage(msg);
      reset();
    }
  }, [onSuccess, updateProgress, reset]);

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
            ? (paused
                ? <Pause size={18} className="text-amber-400" />
                : <Loader2 size={18} className="text-brand animate-spin" />)
            : <Upload size={18} className={isDragActive ? 'text-brand' : 'text-ink-300'}
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

      {/* Progression */}
      {status === 'uploading' && (
        <div className="space-y-2">

          {/* Barre de progression */}
          <div className="h-1.5 bg-ink-600/60 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-500', paused && 'opacity-50')}
              style={{
                width:      `${progress}%`,
                background: paused
                  ? 'linear-gradient(90deg, #92400e, #f59e0b, #fcd34d)'
                  : 'linear-gradient(90deg, #007d98, #00b4d8, #4ddce9)',
                boxShadow: paused
                  ? '0 0 8px rgba(245,158,11,0.5)'
                  : '0 0 8px rgba(0,180,216,0.5)',
              }}
            />
          </div>

          {/* Métriques */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-ink-800/50 border border-ink-600/40 rounded-lg px-2 py-1.5">
              <p className={clsx('font-mono font-bold text-sm', paused ? 'text-amber-400' : 'text-brand')}>
                {progress}%
              </p>
              <p className="text-ink-400 text-[10px] mt-0.5">
                {fmtSize(loaded)} / {fmtSize(total)}
              </p>
            </div>

            <div className="bg-ink-800/50 border border-ink-600/40 rounded-lg px-2 py-1.5">
              <div className="flex items-center justify-center gap-1">
                <Zap size={10} className="text-amber-400" />
                <p className="text-amber-400 font-mono font-bold text-sm">
                  {!paused && speed > 0 ? fmtSize(Math.round(speed)) + '/s' : '—'}
                </p>
              </div>
              <p className="text-ink-400 text-[10px] mt-0.5">Vitesse</p>
            </div>

            <div className="bg-ink-800/50 border border-ink-600/40 rounded-lg px-2 py-1.5">
              <div className="flex items-center justify-center gap-1">
                <Clock size={10} className="text-purple-400" />
                <p className="text-purple-400 font-mono font-bold text-sm">
                  {!paused && eta !== null ? fmtEta(eta) : '—'}
                </p>
              </div>
              <p className="text-ink-400 text-[10px] mt-0.5">Restant</p>
            </div>
          </div>

          {/* Contrôles Pause / Annuler */}
          <div className="flex gap-2 pt-0.5">
            {/* Bouton Pause — uniquement pour les uploads chunked (gros fichiers) */}
            {chunked && (
              <button
                onClick={handlePauseResume}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-95"
                style={paused ? {
                  background: 'rgba(0,180,216,0.12)',
                  border:     '1px solid rgba(0,180,216,0.35)',
                  color:      '#00b4d8',
                  boxShadow:  '0 0 10px rgba(0,180,216,0.15)',
                } : {
                  background: 'rgba(245,158,11,0.10)',
                  border:     '1px solid rgba(245,158,11,0.30)',
                  color:      '#f59e0b',
                }}
              >
                {paused
                  ? <><Play  size={12} /> Reprendre</>
                  : <><Pause size={12} /> Pause</>
                }
              </button>
            )}

            {/* Bouton Annuler */}
            <button
              onClick={handleCancel}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-95"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border:     '1px solid rgba(239,68,68,0.25)',
                color:      '#f87171',
              }}
            >
              <X size={12} /> Annuler
            </button>
          </div>

          <p className="text-xs text-ink-400 text-center">
            {paused
              ? 'Upload en pause — cliquez sur Reprendre pour continuer'
              : 'Chiffrement AES-256 + transmission vers IPFS Cluster…'
            }
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
