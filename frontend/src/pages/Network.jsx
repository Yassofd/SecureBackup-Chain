import { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Server, Star, Wifi, WifiOff, AlertTriangle, RefreshCw, Loader2,
  X, ChevronDown, ChevronUp,
} from 'lucide-react';
import clsx from 'clsx';
import { networkApi } from '../services/api';

// ─── Couleurs par statut ──────────────────────────────────────────────────────
const STATUS = {
  online:  { border: '#22c55e', bg: '#f0fdf4', text: 'text-green-600', label: 'En ligne',    icon: Wifi },
  degraded:{ border: '#f59e0b', bg: '#fffbeb', text: 'text-amber-600',  label: 'Dégradé',    icon: AlertTriangle },
  offline: { border: '#ef4444', bg: '#fef2f2', text: 'text-red-600',    label: 'Hors ligne', icon: WifiOff },
  unknown: { border: '#94a3b8', bg: '#f8fafc', text: 'text-slate-400',  label: 'Inconnu',    icon: Server },
};

const TYPE_LABELS = {
  orderer:   'Orderer',
  peer:      'Peer',
  ca:        'CA',
  couchdb:   'CouchDB',
  ipfs:      'IPFS',
  chaincode: 'Chaincode',
};

// ─── Nœud React-Flow personnalisé ────────────────────────────────────────────
function CustomNode({ data }) {
  const s = STATUS[data.status] || STATUS.unknown;
  const Icon = s.icon;
  return (
    <div
      style={{ borderColor: s.border, background: s.bg }}
      className="rounded-xl border-2 px-4 py-3 shadow-sm min-w-[140px] cursor-pointer select-none"
      onClick={data.onClick}
    >
      <div className="flex items-center gap-2">
        <Icon size={14} className={s.text} />
        <span className="text-xs font-bold text-slate-700 truncate max-w-[100px]">{data.label}</span>
        {data.isLeader && <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />}
      </div>
      <div className="mt-1">
        <span className={clsx('text-[10px] font-medium', s.text)}>{s.label}</span>
        {data.org && <span className="ml-2 text-[10px] text-slate-400">{data.org}</span>}
      </div>
      {data.metrics?.cpuPercent !== undefined && (
        <div className="mt-1 text-[10px] text-slate-400">
          CPU {data.metrics.cpuPercent}% · {data.metrics.memMB} MB
        </div>
      )}
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

// ─── Disposition automatique (colonnes par type) ──────────────────────────────
const COLUMN_ORDER = ['orderer', 'peer', 'ca', 'couchdb', 'ipfs', 'chaincode'];

function buildLayout(nodes) {
  const cols = {};
  COLUMN_ORDER.forEach((t, i) => { cols[t] = i; });
  const rowCount = {};

  return nodes.map((n) => {
    const col = cols[n.type] ?? COLUMN_ORDER.length;
    const row = rowCount[n.type] || 0;
    rowCount[n.type] = row + 1;
    return {
      id:   n.id,
      type: 'custom',
      position: { x: col * 180 + 40, y: row * 120 + 60 },
      data: {
        label:    n.name.split('.')[0],
        status:   n.status,
        isLeader: n.isLeader,
        org:      n.organization,
        metrics:  n.metrics,
        onClick:  null, // sera injecté après
      },
    };
  });
}

function buildEdges(nodes) {
  const edges = [];
  const orderer = nodes.find((n) => n.type === 'orderer');
  const peers   = nodes.filter((n) => n.type === 'peer');
  const couchs  = nodes.filter((n) => n.type === 'couchdb');
  const ca      = nodes.find((n) => n.type === 'ca');

  peers.forEach((p, i) => {
    if (orderer) edges.push({ id: `o-p${i}`, source: orderer.id, target: p.id, animated: orderer.status === 'online' && p.status === 'online' });
    if (couchs[i]) edges.push({ id: `p-c${i}`, source: p.id, target: couchs[i].id });
    if (ca) edges.push({ id: `ca-p${i}`, source: ca.id, target: p.id, style: { strokeDasharray: '4 2' } });
  });
  return edges;
}

// ─── Panneau latéral de détails ───────────────────────────────────────────────
function SidePanel({ nodeId, nodeName, onClose }) {
  const [detail, setDetail]   = useState(null);
  const [logs, setLogs]       = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (!nodeId) return;
    networkApi.node(nodeId).then(({ data }) => setDetail(data.node)).catch(() => {});
  }, [nodeId]);

  async function fetchLogs() {
    setLoadingLogs(true);
    try {
      const { data } = await networkApi.logs(nodeId);
      setLogs(data.logs);
      setShowLogs(true);
    } catch {
      setLogs('[Erreur lors de la récupération des logs]');
      setShowLogs(true);
    } finally {
      setLoadingLogs(false);
    }
  }

  if (!detail) return (
    <div className="flex items-center justify-center h-full text-slate-400">
      <Loader2 size={20} className="animate-spin" />
    </div>
  );

  const s = STATUS[detail.status] || STATUS.unknown;
  const Icon = s.icon;

  return (
    <div className="p-4 h-full overflow-y-auto text-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 truncate">{detail.name}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
      </div>

      <div className="space-y-3">
        <Row label="Type"    value={TYPE_LABELS[detail.type] || detail.type} />
        <Row label="Org"     value={detail.organization || '—'} />
        <Row label="Port"    value={detail.port || '—'} />
        <Row label="Statut"  value={
          <span className={clsx('flex items-center gap-1 font-medium', s.text)}>
            <Icon size={12} /> {s.label}
          </span>
        } />
        {detail.isLeader && (
          <Row label="Rôle" value={<span className="flex items-center gap-1 text-amber-500"><Star size={12} className="fill-amber-400" /> Leader Raft</span>} />
        )}
        <Row label="Vu à" value={detail.lastSeen ? new Date(detail.lastSeen).toLocaleString('fr-FR') : '—'} />

        {detail.metrics && (
          <>
            {detail.metrics.cpuPercent !== undefined && (
              <Row label="CPU"    value={`${detail.metrics.cpuPercent} %`} />
            )}
            {detail.metrics.memMB !== undefined && (
              <Row label="RAM"    value={`${detail.metrics.memMB} / ${detail.metrics.memLimitMB} MB`} />
            )}
            {detail.metrics.image && (
              <Row label="Image"  value={<span className="font-mono text-xs break-all">{detail.metrics.image}</span>} />
            )}
          </>
        )}
      </div>

      <button
        onClick={showLogs ? () => setShowLogs(false) : fetchLogs}
        disabled={loadingLogs}
        className="mt-4 flex items-center gap-2 text-xs text-indigo-600 hover:underline disabled:opacity-50"
      >
        {loadingLogs ? <Loader2 size={12} className="animate-spin" /> : showLogs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {showLogs ? 'Masquer les logs' : 'Afficher les logs'}
      </button>

      {showLogs && (
        <pre className="mt-2 bg-slate-900 text-green-400 text-[10px] p-3 rounded-lg overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
          {logs || '(aucun log)'}
        </pre>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="text-slate-400 shrink-0 w-16">{label}</span>
      <span className="text-slate-700 break-all">{value}</span>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Network() {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const [health, setHealth]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null); // { id, name }
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadTopology = useCallback(async () => {
    try {
      const [topoRes, healthRes] = await Promise.all([
        networkApi.topology(),
        networkApi.health(),
      ]);
      const nodes = topoRes.data.nodes;
      setHealth(healthRes.data);

      const layout = buildLayout(nodes);
      layout.forEach((n) => {
        const src = nodes.find((x) => x.id === n.id);
        n.data.onClick = () => setSelected({ id: src.id, name: src.name });
      });

      setRfNodes(layout);
      setRfEdges(buildEdges(nodes));
      setLastRefresh(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTopology();
    const iv = setInterval(loadTopology, 30_000);
    return () => clearInterval(iv);
  }, [loadTopology]);

  const globalStatus = health?.status || 'unknown';
  const STATUS_GLOBAL = {
    healthy:  'text-green-600 bg-green-50 border-green-200',
    degraded: 'text-amber-600 bg-amber-50 border-amber-200',
    unknown:  'text-slate-500 bg-slate-50 border-slate-200',
  };

  return (
    <div className="flex h-full">
      {/* Zone principale */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* En-tête */}
        <div className="p-6 pb-0 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Réseau</h1>
            <p className="text-slate-500 text-sm mt-0.5">Vue topologique en temps réel</p>
          </div>
          <div className="flex items-center gap-3">
            {health && (
              <div className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium', STATUS_GLOBAL[globalStatus])}>
                <span className={clsx('w-2 h-2 rounded-full', globalStatus === 'healthy' ? 'bg-green-500' : globalStatus === 'degraded' ? 'bg-amber-400' : 'bg-slate-400')} />
                {globalStatus === 'healthy' ? 'Réseau sain' : globalStatus === 'degraded' ? 'Réseau dégradé' : 'Inconnu'}
                <span className="text-xs opacity-70 ml-1">({health.online}/{health.total})</span>
              </div>
            )}
            <button
              onClick={loadTopology}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Actualiser
            </button>
          </div>
        </div>

        {lastRefresh && (
          <p className="px-6 pt-1 text-xs text-slate-400">
            Dernière mise à jour : {lastRefresh.toLocaleTimeString('fr-FR')}
          </p>
        )}

        {/* Graphe React-Flow */}
        <div className="flex-1 m-4 mt-3 rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
          {loading && rfNodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : rfNodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              <Server size={40} className="mx-auto mb-3 opacity-20" />
            </div>
          ) : (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} color="#e2e8f0" />
              <Controls showInteractive={false} />
              <MiniMap nodeColor={(n) => STATUS[n.data?.status]?.border || '#94a3b8'} pannable zoomable />
            </ReactFlow>
          )}
        </div>

        {/* Légende */}
        <div className="px-6 pb-4 flex items-center gap-4 text-xs text-slate-500 shrink-0">
          {Object.entries(STATUS).map(([key, val]) => (
            <span key={key} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: val.border }} />
              {val.label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <Star size={11} className="fill-amber-400 text-amber-400" /> Leader Raft
          </span>
        </div>
      </div>

      {/* Panneau latéral */}
      {selected && (
        <div className="w-72 border-l border-slate-200 bg-white shrink-0">
          <SidePanel
            nodeId={selected.id}
            nodeName={selected.name}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  );
}
