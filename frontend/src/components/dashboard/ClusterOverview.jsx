import { useState, useEffect } from 'react';
import { Server, Wifi, WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { networkApi, backupsApi } from '../../services/api';

export default function ClusterOverview() {
  const [health, setHealth]   = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [netRes, sysRes] = await Promise.allSettled([
        networkApi.health(),
        backupsApi.health(),
      ]);
      const net = netRes.status === 'fulfilled' ? netRes.value.data : null;
      const sys = sysRes.status === 'fulfilled' ? sysRes.value.data : null;
      setHealth({ net, sys });
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); const iv = setInterval(load, 30_000); return () => clearInterval(iv); }, []);

  const fabricOk = health?.sys?.fabric === 'ok';
  const ipfsOk   = health?.sys?.ipfs   === 'ok';
  const netOnline = health?.net?.online ?? 0;
  const netTotal  = health?.net?.total  ?? 0;
  const netStatus = health?.net?.status;

  const nodes = [
    { label: 'Hyperledger Fabric', ok: fabricOk,     icon: Server,    color: fabricOk ? 'text-emerald-400' : 'text-red-400', bg: fabricOk ? 'bg-emerald-500/10' : 'bg-red-500/10' },
    { label: 'IPFS Cluster',       ok: ipfsOk,       icon: Wifi,      color: ipfsOk   ? 'text-emerald-400' : 'text-red-400', bg: ipfsOk   ? 'bg-emerald-500/10' : 'bg-red-500/10' },
    { label: `Réseau (${netOnline}/${netTotal})`, ok: netStatus === 'healthy', icon: netStatus === 'healthy' ? Wifi : netStatus === 'degraded' ? AlertTriangle : WifiOff,
      color: netStatus === 'healthy' ? 'text-emerald-400' : netStatus === 'degraded' ? 'text-amber-400' : 'text-ink-400',
      bg: netStatus === 'healthy' ? 'bg-emerald-500/10' : netStatus === 'degraded' ? 'bg-amber-500/10' : 'bg-ink-700' },
  ];

  return (
    <div
      className="relative rounded-xl border overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(0,180,216,0.06) 0%, rgba(139,92,246,0.04) 50%, rgba(11,11,24,0) 100%)',
        borderColor: 'rgba(0,180,216,0.2)',
        boxShadow: '0 0 40px rgba(0,180,216,0.06), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* Ambient glow */}
      <div className="absolute top-0 left-0 w-64 h-16 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 0% 0%, rgba(0,180,216,0.12) 0%, transparent 70%)' }} />

      <div className="relative px-6 py-4 flex flex-wrap items-center gap-6">
        {/* Title */}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-300 uppercase tracking-widest mb-0.5">État du cluster</p>
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                'inline-flex items-center gap-1.5 text-sm font-bold',
                loading ? 'text-ink-400' :
                fabricOk && ipfsOk ? 'text-emerald-400' : 'text-amber-400',
              )}
            >
              <span className={clsx(
                'w-2 h-2 rounded-full',
                loading ? 'bg-ink-500' :
                fabricOk && ipfsOk ? 'bg-emerald-400 dot-live' : 'bg-amber-400',
              )} />
              {loading ? 'Chargement…' : fabricOk && ipfsOk ? 'Opérationnel' : 'Dégradé'}
            </span>
          </div>
        </div>

        {/* Separator */}
        <div className="hidden sm:block w-px h-10 bg-ink-600" />

        {/* Service status pills */}
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {nodes.map(({ label, ok, icon: Icon, color, bg }) => (
            <div key={label} className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg border', bg,
              ok ? 'border-emerald-500/20' : 'border-red-500/20 border-amber-500/20')}>
              <Icon size={13} className={color} />
              <span className="text-xs font-medium text-ink-100">{label}</span>
              <span className={clsx('w-1.5 h-1.5 rounded-full', ok ? 'bg-emerald-400' : 'bg-amber-400')} />
            </div>
          ))}
        </div>

        {/* Refresh */}
        <button onClick={load} disabled={loading}
          className="p-2 text-ink-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors shrink-0">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  );
}
