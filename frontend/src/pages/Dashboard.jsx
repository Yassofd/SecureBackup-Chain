import { useState, useEffect } from 'react';
import { HardDrive, Shield, Activity, Wifi, RefreshCw } from 'lucide-react';
import StatCard from '../components/StatCard';
import UploadZone from '../components/UploadZone';
import BackupRow from '../components/BackupRow';
import { backupsApi } from '../services/api';

function formatSize(bytes) {
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export default function Dashboard() {
  const [backups, setBackups] = useState([]);
  const [health,  setHealth]  = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [bRes, hRes] = await Promise.allSettled([backupsApi.list(), backupsApi.health()]);
      if (bRes.status === 'fulfilled') setBackups(bRes.value.data);
      if (hRes.status === 'fulfilled') setHealth(hRes.value.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const totalSize = backups.reduce((s, b) => s + (b.fileSize || 0), 0);
  const networkOk = health?.fabric === 'ok' && health?.ipfs === 'ok';

  return (
    <div className="p-7">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Vue d'ensemble du système de sauvegarde</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={networkOk ? 'badge-green' : 'badge-red'}>
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${networkOk ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {networkOk ? 'Réseau opérationnel' : 'Réseau en erreur'}
          </span>
          <button onClick={load} disabled={loading} className="btn-ghost p-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Stat cells — InfluxDB style ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <StatCard
          label="Sauvegardes"
          value={loading ? '—' : backups.length}
          icon={HardDrive}
          color="cyan"
        />
        <StatCard
          label="Stockage IPFS"
          value={loading ? '—' : formatSize(totalSize)}
          icon={Activity}
          color="purple"
        />
        <StatCard
          label="Réseau"
          value={loading ? '—' : networkOk ? 'OK' : 'ERR'}
          icon={Wifi}
          color={loading ? 'cyan' : networkOk ? 'green' : 'amber'}
          sub="Fabric + IPFS Cluster"
        />
        <StatCard
          label="Chaincode"
          value="backup-cc"
          icon={Shield}
          color="indigo"
          sub="canal: backupchannel"
        />
      </div>

      {/* ── Main grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent backups — panel avec header distinct */}
        <div className="lg:col-span-2 panel">
          <div className="panel-header">
            <span className="panel-title">Sauvegardes récentes</span>
            <span className="text-xs text-ink-300 font-mono">{backups.length} total</span>
          </div>
          {loading ? (
            <div className="p-10 text-center">
              <div className="w-5 h-5 border-2 border-ink-500 border-t-brand rounded-full animate-spin mx-auto" />
              <p className="text-ink-300 text-xs mt-3">Chargement…</p>
            </div>
          ) : backups.length === 0 ? (
            <div className="p-10 text-center">
              <HardDrive size={28} className="text-ink-500 mx-auto mb-2" />
              <p className="text-ink-300 text-sm">Aucune sauvegarde — déposez un fichier →</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink-500">
                    <th className="th">Fichier</th>
                    <th className="th">Taille</th>
                    <th className="th">Date</th>
                    <th className="th">Statut</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {[...backups].reverse().slice(0, 6).map((b) => (
                    <BackupRow key={b.backupId} backup={b} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Upload — panel avec header distinct */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="panel-title">Nouvelle sauvegarde</span>
              <p className="text-[11px] text-ink-400 mt-0.5 font-mono">AES-256 + IPFS Cluster</p>
            </div>
          </div>
          <div className="panel-body">
            <UploadZone onSuccess={load} />
          </div>
        </div>

      </div>
    </div>
  );
}
