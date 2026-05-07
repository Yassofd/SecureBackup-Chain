import { useState, useEffect } from 'react';
import { HardDrive, Shield, Activity, Wifi } from 'lucide-react';
import StatCard from '../components/StatCard';
import UploadZone from '../components/UploadZone';
import BackupRow from '../components/BackupRow';
import { backupsApi } from '../services/api';

function formatSize(bytes) {
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function Dashboard() {
  const [backups, setBackups] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [bRes, hRes] = await Promise.allSettled([backupsApi.list(), backupsApi.health()]);
      if (bRes.status === 'fulfilled') setBackups(bRes.value.data);
      if (hRes.status === 'fulfilled') setHealth(hRes.value.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalSize = backups.reduce((s, b) => s + (b.fileSize || 0), 0);
  const networkOk = health?.fabric === 'ok' && health?.ipfs === 'ok';

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Sauvegardes" value={loading ? '…' : backups.length} icon={HardDrive} color="indigo" />
        <StatCard label="Stockage IPFS" value={loading ? '…' : formatSize(totalSize)} icon={Activity} color="blue" />
        <StatCard label="Réseau" value={loading ? '…' : networkOk ? 'OK' : 'Erreur'} icon={Wifi} color={networkOk ? 'green' : 'amber'} sub="Fabric + IPFS" />
        <StatCard label="Blockchain" value="backupchannel" icon={Shield} color="indigo" sub="backup-cc" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Sauvegardes récentes</h2>
          {loading ? (
            <p className="text-gray-400 text-sm">Chargement…</p>
          ) : backups.length === 0 ? (
            <p className="text-gray-400 text-sm">Aucune sauvegarde pour l'instant. Déposez un fichier →</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 px-4">Fichier</th>
                    <th className="pb-2 px-4">Taille</th>
                    <th className="pb-2 px-4">Date</th>
                    <th className="pb-2 px-4">Statut</th>
                    <th className="pb-2 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {[...backups].reverse().slice(0, 5).map((b) => (
                    <BackupRow key={b.backupId} backup={b} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Nouvelle sauvegarde</h2>
          <UploadZone onSuccess={load} />
        </div>
      </div>
    </div>
  );
}
