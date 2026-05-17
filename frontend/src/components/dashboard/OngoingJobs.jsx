import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, HardDrive } from 'lucide-react';
import clsx from 'clsx';
import { backupsApi } from '../../services/api';

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

const STATUS_CFG = {
  active:    { icon: Loader2,       color: 'text-brand',       bg: 'bg-brand/10',       label: 'Actif',    spin: true },
  completed: { icon: CheckCircle,   color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Terminé',  spin: false },
  failed:    { icon: XCircle,       color: 'text-red-400',     bg: 'bg-red-500/10',     label: 'Échec',    spin: false },
  pending:   { icon: Clock,         color: 'text-amber-400',   bg: 'bg-amber-500/10',   label: 'En attente',spin: false },
};

export default function OngoingJobs() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    backupsApi.list()
      .then(({ data }) => setBackups([...data].reverse().slice(0, 6)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header">
        <span className="panel-title flex items-center gap-2">
          <HardDrive size={13} className="text-brand" /> Sauvegardes récentes
        </span>
        <span className="text-xs text-ink-300 font-mono">{backups.length} entrée(s)</span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-ink-500 border-t-brand rounded-full animate-spin" />
        </div>
      ) : backups.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-ink-400 text-sm gap-2">
          <HardDrive size={28} className="opacity-30" />
          Aucune sauvegarde
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-ink-700/60">
          {backups.map((b) => {
            const cfg = STATUS_CFG[b.status] ?? STATUS_CFG.completed;
            const Icon = cfg.icon;
            return (
              <div key={b.backupId} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
                  <Icon size={14} className={clsx(cfg.color, cfg.spin && 'animate-spin')} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-100 font-medium truncate">{b.fileName}</p>
                  <p className="text-[11px] text-ink-400 font-mono mt-0.5">{formatDate(b.timestamp)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono text-ink-200">{formatSize(b.fileSize)}</p>
                  <span className={clsx('text-[10px] font-semibold', cfg.color)}>{cfg.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
