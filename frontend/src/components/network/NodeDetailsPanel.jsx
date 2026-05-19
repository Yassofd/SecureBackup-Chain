import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Cpu, Server, HardDrive, Clock, ChevronDown, ChevronUp, Loader2, Star, Activity, Database } from 'lucide-react';
import { networkApi } from '../../services/api';

const TYPE_LABELS = {
  orderer: 'Orderer Raft', peer: 'Peer', ca: 'CA',
  couchdb: 'CouchDB', ipfs: 'IPFS', chaincode: 'Chaincode',
};

const STATUS_COLORS = {
  online:   'text-emerald-400',
  syncing:  'text-amber-400',
  degraded: 'text-amber-400',
  offline:  'text-red-400',
  unknown:  'text-ink-300',
};

const STATUS_LABELS = {
  online: 'En ligne', syncing: 'Synchronisation',
  degraded: 'Dégradé', offline: 'Hors ligne', unknown: 'Inconnu',
};

const STATUS_BG = {
  online:   'bg-emerald-500/10 ring-1 ring-emerald-500/20',
  syncing:  'bg-amber-500/10 ring-1 ring-amber-500/20',
  degraded: 'bg-amber-500/10 ring-1 ring-amber-500/20',
  offline:  'bg-red-500/10 ring-1 ring-red-500/20',
  unknown:  'bg-ink-600/40 ring-1 ring-ink-500/20',
};

export function NodeDetailsPanel({ node, onClose }) {
  const [logs, setLogs] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const isOnline = node.status === 'online';
  const isMaster = node.role === 'master';
  const statusColor = STATUS_COLORS[node.status] ?? STATUS_COLORS.unknown;
  const statusBg = STATUS_BG[node.status] ?? STATUS_BG.unknown;

  async function fetchLogs() {
    setLoadingLogs(true);
    try {
      const { data } = await networkApi.logs(node.id);
      setLogs(data.logs || '(aucun log)');
      setShowLogs(true);
    } catch {
      setLogs('[Erreur lors de la récupération des logs]');
      setShowLogs(true);
    } finally {
      setLoadingLogs(false);
    }
  }

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      className="w-[360px] h-full glass-surface border-l border-ink-500/40 shadow-glass-md flex flex-col z-30 shrink-0"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-ink-500/30 flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full shrink-0 ${
          isOnline ? 'bg-emerald-400 status-pulse'
          : node.status === 'syncing' ? 'bg-amber-400 status-pulse'
          : 'bg-red-400'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink-50 truncate">{node.label}</div>
          <div className="text-xs text-ink-400">{TYPE_LABELS[node.type] ?? node.type ?? '—'}</div>
        </div>
        {isMaster && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-semibold bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/20 shrink-0">
            <Star size={8} className="fill-purple-400" /> LEADER
          </span>
        )}
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-ink-600/70 transition-colors text-ink-400 hover:text-ink-50 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Status banner */}
        <div className={`rounded-lg p-3 flex items-center gap-3 ${statusBg}`}>
          <Server className={`w-4 h-4 shrink-0 ${statusColor}`} />
          <div>
            <div className={`text-xs font-medium ${statusColor}`}>
              {STATUS_LABELS[node.status] ?? 'Inconnu'}
            </div>
            <div className="text-[11px] text-ink-400 mt-0.5">
              {isOnline
                ? `Org : ${node.organization || '—'} · Port ${node.port || '—'}`
                : 'Nœud injoignable'}
            </div>
          </div>
        </div>

        {/* Metrics */}
        {(isOnline || node.status === 'syncing') && (node.cpu > 0 || node.ram > 0) && (
          <div className="space-y-3">
            <SectionTitle>Ressources</SectionTitle>
            <GaugeMetric
              icon={Cpu}
              label="CPU"
              value={node.cpu}
              unit="%"
              color={node.cpu > 80 ? 'bg-red-400' : node.cpu > 60 ? 'bg-amber-400' : 'bg-emerald-400'}
            />
            <GaugeMetric icon={Database} label="RAM" value={node.ram} unit="%" color="bg-purple-400" />
          </div>
        )}

        {/* Info grid */}
        <div className="space-y-3">
          <SectionTitle>Informations</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <InfoCard icon={Server} label="Type" value={TYPE_LABELS[node.type] ?? node.type ?? '—'} />
            <InfoCard icon={Activity} label="Port" value={node.port ? String(node.port) : '—'} />
            <InfoCard icon={HardDrive} label="Organisation" value={node.organization || '—'} />
            <InfoCard
              icon={Clock}
              label="Dernière vue"
              value={node.lastSeen ? new Date(node.lastSeen).toLocaleTimeString('fr-FR') : '—'}
            />
          </div>
          {node.image && (
            <div className="rounded-lg bg-ink-700/40 px-3 py-2.5 ring-1 ring-ink-500/20">
              <div className="text-[10px] text-ink-400 mb-1">Image Docker</div>
              <div className="text-[10px] font-mono text-ink-200 break-all leading-relaxed">{node.image}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <button
            onClick={showLogs ? () => setShowLogs(false) : fetchLogs}
            disabled={loadingLogs}
            className="w-full h-9 rounded-lg bg-ink-600/50 text-ink-200 text-xs font-medium hover:bg-ink-550/70 transition-colors flex items-center justify-center gap-1.5 ring-1 ring-ink-500/30 disabled:opacity-50"
          >
            {loadingLogs
              ? <Loader2 size={12} className="animate-spin" />
              : showLogs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showLogs ? 'Masquer les logs' : 'Afficher les logs'}
          </button>

          {showLogs && (
            <pre className="bg-ink-900/90 text-emerald-400 text-[10px] p-3 rounded-lg overflow-x-auto max-h-56 whitespace-pre-wrap break-all border border-ink-600/30 font-mono leading-relaxed">
              {logs}
            </pre>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">{children}</h3>
  );
}

function GaugeMetric({ icon: Icon, label, value, unit, color }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-ink-500 shrink-0" />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-ink-300">{label}</span>
          <span className="text-xs font-medium tabular-nums text-ink-100">{value}{unit}</span>
        </div>
        <div className="h-1.5 bg-ink-600/50 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${color}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(value, 100)}%` }}
            transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg bg-ink-700/40 p-2.5 ring-1 ring-ink-500/20">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-ink-500" />
        <span className="text-[10px] text-ink-400">{label}</span>
      </div>
      <div className="text-xs font-medium text-ink-100 tabular-nums truncate">{value}</div>
    </div>
  );
}
