import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { HardDrive, Shield, Activity, Wifi, RefreshCw } from 'lucide-react';
import { backupsApi } from '../services/api';
import UploadZone from '../components/UploadZone';
import BackupRow from '../components/BackupRow';
import MetricCard from '../components/dashboard/MetricCard';
import ClusterOverview from '../components/dashboard/ClusterOverview';
import BackupSizesChart from '../components/dashboard/BackupSizesChart';
import ThroughputChart from '../components/dashboard/ThroughputChart';
import OngoingJobs from '../components/dashboard/OngoingJobs';
import SystemHealth from '../components/dashboard/SystemHealth';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function useSparkline(base, variance) {
  const [data, setData] = useState(() =>
    Array.from({ length: 12 }, () => Math.round(base + (Math.random() - 0.5) * variance))
  );
  useEffect(() => {
    const iv = setInterval(() => {
      setData((prev) => {
        const last = prev[prev.length - 1];
        const next = Math.max(0, Math.round(last + (Math.random() - 0.5) * (variance * 0.3)));
        return [...prev.slice(1), next];
      });
    }, 4000);
    return () => clearInterval(iv);
  }, [base, variance]);
  return data;
}

const fadeUp  = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

export default function Dashboard() {
  const [backups, setBackups] = useState([]);
  const [health,  setHealth]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartKey, setChartKey] = useState(0);

  const sparkBackups   = useSparkline(40, 20);
  const sparkStorage   = useSparkline(60, 15);
  const sparkNetwork   = useSparkline(80, 10);
  const sparkChaincode = useSparkline(95, 5);

  const load = async () => {
    setLoading(true);
    try {
      const [bRes, hRes] = await Promise.allSettled([backupsApi.list(), backupsApi.health()]);
      if (bRes.status === 'fulfilled') setBackups(bRes.value.data);
      if (hRes.status === 'fulfilled') setHealth(hRes.value.data);
    } finally { setLoading(false); setChartKey((k) => k + 1); }
  };

  useEffect(() => { load(); }, []);

  const totalSize = backups.reduce((s, b) => s + (b.fileSize || 0), 0);
  const fabricOk  = health?.fabric === 'ok';
  const ipfsOk    = health?.ipfs   === 'ok';
  const networkOk = fabricOk && ipfsOk;

  return (
    <div className="p-6 space-y-5">

      {/* Cluster overview */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <ClusterOverview />
      </motion.div>

      {/* Metric cards */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <motion.div variants={fadeUp}>
          <MetricCard label="Sauvegardes" value={loading ? '—' : backups.length} icon={HardDrive} color="cyan" sparkData={sparkBackups} change={backups.length > 0 ? `+${backups.length} total` : '0'} trend="up" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <MetricCard label="Stockage IPFS" value={loading ? '—' : formatSize(totalSize)} icon={Activity} color="purple" sparkData={sparkStorage} sub="AES-256 chiffré" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <MetricCard label="Réseau" value={loading ? '—' : networkOk ? 'OK' : 'ERR'} icon={Wifi} color={loading ? 'cyan' : networkOk ? 'green' : 'amber'} sparkData={sparkNetwork} change={networkOk ? 'Fabric + IPFS' : 'Vérifier les services'} trend={networkOk ? 'up' : 'down'} />
        </motion.div>
        <motion.div variants={fadeUp}>
          <MetricCard label="Chaincode" value="backup-cc" icon={Shield} color="indigo" sparkData={sparkChaincode} sub="backupchannel" />
        </motion.div>
      </motion.div>

      {/* Jobs + health */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="grid grid-cols-1 xl:grid-cols-3 gap-5" style={{ minHeight: 280 }}>
        <div className="xl:col-span-2"><OngoingJobs key={chartKey} /></div>
        <SystemHealth />
      </motion.div>

      {/* Charts */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="grid grid-cols-1 xl:grid-cols-2 gap-5" style={{ minHeight: 240 }}>
        <BackupSizesChart key={chartKey} />
        <ThroughputChart />
      </motion.div>

      {/* Recent backups table + Upload */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        <div className="lg:col-span-2 panel">
          <div className="panel-header">
            <span className="panel-title">Sauvegardes récentes</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-300 font-mono">{backups.length} total</span>
              <button onClick={load} disabled={loading} className="p-1.5 text-ink-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-6 h-6 rounded-full border-2 border-ink-500 border-t-brand animate-spin mx-auto" />
              <p className="text-ink-300 text-xs mt-3">Chargement…</p>
            </div>
          ) : backups.length === 0 ? (
            <div className="p-12 text-center">
              <HardDrive size={22} className="text-ink-500 mx-auto mb-3" />
              <p className="text-ink-300 text-sm">Aucune sauvegarde — déposez un fichier →</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink-500/50">
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
      </motion.div>
    </div>
  );
}
