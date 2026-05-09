import { useState, useEffect, useCallback } from 'react';
import ReactFlow, { Background, Controls, MiniMap, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css';
import { Server, Star, Wifi, WifiOff, AlertTriangle, RefreshCw, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { networkApi } from '../services/api';

const STATUS = {
  online:  { border: '#00b4d8', bg: '#00b4d815', text: 'text-brand',    label: 'En ligne',    icon: Wifi },
  degraded:{ border: '#f59e0b', bg: '#f59e0b15', text: 'text-amber-400', label: 'Dégradé',    icon: AlertTriangle },
  offline: { border: '#ef4444', bg: '#ef444415', text: 'text-red-400',   label: 'Hors ligne', icon: WifiOff },
  unknown: { border: '#3d3d6a', bg: '#1c1c2e',   text: 'text-ink-300',  label: 'Inconnu',    icon: Server },
};

const TYPE_LABELS = { orderer: 'Orderer', peer: 'Peer', ca: 'CA', couchdb: 'CouchDB', ipfs: 'IPFS', chaincode: 'Chaincode' };
const COLUMN_ORDER = ['orderer', 'peer', 'ca', 'couchdb', 'ipfs', 'chaincode'];

function CustomNode({ data }) {
  const s = STATUS[data.status] || STATUS.unknown;
  const Icon = s.icon;
  return (
    <div
      style={{ borderColor: s.border, background: '#1c1c2e' }}
      className="rounded-xl border-2 px-4 py-3 shadow-xl min-w-[140px] cursor-pointer select-none"
      onClick={data.onClick}
    >
      <div className="flex items-center gap-2">
        <Icon size={13} style={{ color: s.border }} />
        <span className="text-xs font-bold text-ink-50 truncate max-w-[100px]">{data.label}</span>
        {data.isLeader && <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />}
      </div>
      <span className={clsx('text-[10px] font-medium mt-0.5 block', s.text)}>{s.label}</span>
      {data.org && <span className="text-[10px] text-ink-400 block">{data.org}</span>}
      {data.metrics?.cpuPercent !== undefined && (
        <div className="mt-1 text-[10px] text-ink-400">CPU {data.metrics.cpuPercent}% · {data.metrics.memMB} MB</div>
      )}
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

function buildLayout(nodes) {
  const cols = {}; COLUMN_ORDER.forEach((t, i) => { cols[t] = i; });
  const rowCount = {};
  return nodes.map((n) => {
    const col = cols[n.type] ?? COLUMN_ORDER.length;
    const row = rowCount[n.type] || 0;
    rowCount[n.type] = row + 1;
    return { id: n.id, type: 'custom', position: { x: col * 180 + 40, y: row * 120 + 60 },
      data: { label: n.name.split('.')[0], status: n.status, isLeader: n.isLeader, org: n.organization, metrics: n.metrics, onClick: null } };
  });
}

function buildEdges(nodes) {
  const edges = [];
  const orderer = nodes.find((n) => n.type === 'orderer');
  const peers   = nodes.filter((n) => n.type === 'peer');
  const couchs  = nodes.filter((n) => n.type === 'couchdb');
  const ca      = nodes.find((n) => n.type === 'ca');
  peers.forEach((p, i) => {
    if (orderer) edges.push({ id: `o-p${i}`, source: orderer.id, target: p.id, style: { stroke: '#00b4d8', opacity: 0.6 }, animated: orderer.status === 'online' && p.status === 'online' });
    if (couchs[i]) edges.push({ id: `p-c${i}`, source: p.id, target: couchs[i].id, style: { stroke: '#3d3d6a' } });
    if (ca) edges.push({ id: `ca-p${i}`, source: ca.id, target: p.id, style: { stroke: '#3d3d6a', strokeDasharray: '4 2' } });
  });
  return edges;
}

function Row({ label, value }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-ink-300 shrink-0 w-16 text-xs">{label}</span>
      <span className="text-ink-100 break-all text-xs">{value}</span>
    </div>
  );
}

function SidePanel({ nodeId, onClose }) {
  const [detail, setDetail]       = useState(null);
  const [logs, setLogs]           = useState('');
  const [showLogs, setShowLogs]   = useState(false);
  const [loadingLogs, setLdLogs]  = useState(false);

  useEffect(() => {
    if (!nodeId) return;
    networkApi.node(nodeId).then(({ data }) => setDetail(data.node)).catch(() => {});
  }, [nodeId]);

  async function fetchLogs() {
    setLdLogs(true);
    try { const { data } = await networkApi.logs(nodeId); setLogs(data.logs); setShowLogs(true); }
    catch { setLogs('[Erreur lors de la récupération des logs]'); setShowLogs(true); }
    finally { setLdLogs(false); }
  }

  if (!detail) return (
    <div className="flex items-center justify-center h-full text-ink-300">
      <Loader2 size={18} className="animate-spin" />
    </div>
  );

  const s = STATUS[detail.status] || STATUS.unknown;
  const Icon = s.icon;

  return (
    <div className="p-4 h-full overflow-y-auto text-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-ink-50 truncate text-sm">{detail.name}</h3>
        <button onClick={onClose} className="p-1.5 text-ink-300 hover:text-ink-50 hover:bg-ink-600 rounded-lg transition-colors"><X size={14} /></button>
      </div>
      <div className="space-y-2.5">
        <Row label="Type"   value={TYPE_LABELS[detail.type] || detail.type} />
        <Row label="Org"    value={detail.organization || '—'} />
        <Row label="Port"   value={detail.port || '—'} />
        <Row label="Statut" value={<span className={clsx('flex items-center gap-1 font-medium text-xs', s.text)}><Icon size={11} />{s.label}</span>} />
        {detail.isLeader && <Row label="Rôle" value={<span className="flex items-center gap-1 text-amber-400 text-xs"><Star size={10} className="fill-amber-400" /> Leader Raft</span>} />}
        <Row label="Vu à"   value={detail.lastSeen ? new Date(detail.lastSeen).toLocaleString('fr-FR') : '—'} />
        {detail.metrics?.cpuPercent !== undefined && <Row label="CPU" value={`${detail.metrics.cpuPercent} %`} />}
        {detail.metrics?.memMB !== undefined && <Row label="RAM" value={`${detail.metrics.memMB} / ${detail.metrics.memLimitMB} MB`} />}
        {detail.metrics?.image && <Row label="Image" value={<span className="font-mono text-[10px] break-all">{detail.metrics.image}</span>} />}
      </div>

      <button onClick={showLogs ? () => setShowLogs(false) : fetchLogs} disabled={loadingLogs}
        className="mt-4 flex items-center gap-1.5 text-xs text-brand hover:text-brand-300 disabled:opacity-50 transition-colors">
        {loadingLogs ? <Loader2 size={11} className="animate-spin" /> : showLogs ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        {showLogs ? 'Masquer les logs' : 'Afficher les logs'}
      </button>
      {showLogs && (
        <pre className="mt-2 bg-ink-900 text-emerald-400 text-[10px] p-3 rounded-lg overflow-x-auto max-h-64 whitespace-pre-wrap break-all border border-ink-600">
          {logs || '(aucun log)'}
        </pre>
      )}
    </div>
  );
}

export default function Network() {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const [health, setHealth]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [lastRefresh, setLast]    = useState(null);

  const loadTopology = useCallback(async () => {
    try {
      const [topoRes, healthRes] = await Promise.all([networkApi.topology(), networkApi.health()]);
      const nodes = topoRes.data.nodes;
      setHealth(healthRes.data);
      const layout = buildLayout(nodes);
      layout.forEach((n) => {
        const src = nodes.find((x) => x.id === n.id);
        n.data.onClick = () => setSelected({ id: src.id, name: src.name });
      });
      setRfNodes(layout); setRfEdges(buildEdges(nodes)); setLast(new Date());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTopology(); const iv = setInterval(loadTopology, 30_000); return () => clearInterval(iv); }, [loadTopology]);

  const gs = health?.status || 'unknown';
  const gsBadge = { healthy: 'badge-green', degraded: 'badge-amber', unknown: 'badge-blue' };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-7 py-5 flex items-center justify-between shrink-0 border-b border-ink-600">
          <div>
            <h1 className="page-title">Réseau</h1>
            <p className="page-sub">{lastRefresh ? `Mis à jour à ${lastRefresh.toLocaleTimeString('fr-FR')}` : 'Vue topologique en temps réel'}</p>
          </div>
          <div className="flex items-center gap-2">
            {health && (
              <span className={gsBadge[gs]}>
                <span className={clsx('w-1.5 h-1.5 rounded-full mr-1.5', gs === 'healthy' ? 'bg-emerald-400' : gs === 'degraded' ? 'bg-amber-400' : 'bg-ink-300')} />
                {gs === 'healthy' ? 'Réseau sain' : gs === 'degraded' ? 'Dégradé' : 'Inconnu'}
                <span className="ml-1 opacity-70">({health.online}/{health.total})</span>
              </span>
            )}
            <button onClick={loadTopology} disabled={loading} className="btn-outline flex items-center gap-1.5">
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Actualiser
            </button>
          </div>
        </div>

        <div className="flex-1 m-4 rounded-xl border border-ink-600 overflow-hidden bg-ink-800">
          {loading && rfNodes.length === 0 ? (
            <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-brand" /></div>
          ) : rfNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-ink-400">
              <Server size={36} className="mb-3 opacity-30" />
              <p className="text-sm">Aucun nœud détecté</p>
            </div>
          ) : (
            <ReactFlow nodes={rfNodes} edges={rfEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.3 }} proOptions={{ hideAttribution: true }}>
              <Background gap={20} color="#2e2e4a" />
              <Controls showInteractive={false} style={{ background: '#1c1c2e', border: '1px solid #2e2e4a', borderRadius: 8 }} />
              <MiniMap style={{ background: '#13131f', border: '1px solid #2e2e4a' }} nodeColor={(n) => STATUS[n.data?.status]?.border || '#3d3d6a'} pannable zoomable />
            </ReactFlow>
          )}
        </div>

        <div className="px-7 pb-4 flex items-center gap-4 text-xs text-ink-300 shrink-0">
          {Object.entries(STATUS).filter(([k]) => k !== 'unknown').map(([key, val]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: val.border }} />
              {val.label}
            </span>
          ))}
        </div>
      </div>

      {selected && (
        <div className="w-64 shrink-0 border-l border-ink-600 bg-ink-800 h-full overflow-hidden flex flex-col">
          <SidePanel nodeId={selected.id} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}
