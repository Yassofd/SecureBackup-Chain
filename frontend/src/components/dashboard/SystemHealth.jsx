import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { backupsApi, networkApi } from '../../services/api';

function HealthRow({ label, status, detail }) {
  const ok = status === 'ok' || status === 'healthy' || status === 'online';
  const warn = status === 'degraded';
  const Icon = ok ? CheckCircle : warn ? AlertTriangle : XCircle;
  const color = ok ? 'text-emerald-400' : warn ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-ink-700/60 last:border-0">
      <Icon size={14} className={clsx(color, 'shrink-0')} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink-100">{label}</p>
        {detail && <p className="text-[11px] text-ink-400 font-mono">{detail}</p>}
      </div>
      <span className={clsx('text-[10px] font-semibold uppercase', color)}>
        {ok ? 'OK' : warn ? 'Dégradé' : 'Erreur'}
      </span>
    </div>
  );
}

export default function SystemHealth() {
  const [health, setHealth] = useState(null);
  const [net, setNet]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([backupsApi.health(), networkApi.health()])
      .then(([sysRes, netRes]) => {
        if (sysRes.status === 'fulfilled') setHealth(sysRes.value.data);
        if (netRes.status === 'fulfilled') setNet(netRes.value.data);
      })
      .finally(() => setLoading(false));
    const iv = setInterval(() => {
      Promise.allSettled([backupsApi.health(), networkApi.health()])
        .then(([sysRes, netRes]) => {
          if (sysRes.status === 'fulfilled') setHealth(sysRes.value.data);
          if (netRes.status === 'fulfilled') setNet(netRes.value.data);
        });
    }, 30_000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header">
        <span className="panel-title">Santé du système</span>
        {loading && <Loader2 size={12} className="animate-spin text-ink-400" />}
      </div>
      <div className="flex-1 px-5 overflow-y-auto">
        {loading && !health ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-ink-500 border-t-brand rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <HealthRow label="Hyperledger Fabric" status={health?.fabric} detail="Ledger + chaincode" />
            <HealthRow label="IPFS Cluster"       status={health?.ipfs}   detail="Stockage distribué" />
            <HealthRow
              label="Base de données"
              status={health?.database ?? 'ok'}
              detail="PostgreSQL"
            />
            {net && (
              <HealthRow
                label={`Nœuds réseau (${net.online}/${net.total})`}
                status={net.status}
                detail={net.status === 'healthy' ? 'Tous opérationnels' : `${net.total - (net.online ?? 0)} hors ligne`}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
