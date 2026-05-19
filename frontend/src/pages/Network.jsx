import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Radio, RefreshCw, Loader2 } from 'lucide-react';
import { NetworkCanvas } from '../components/network/NetworkCanvas';
import { NodeDetailsPanel } from '../components/network/NodeDetailsPanel';
import { NodeTooltip } from '../components/network/NodeTooltip';
import { NetworkLegend } from '../components/network/NetworkLegend';
import { networkApi } from '../services/api';

function toCanvasNode(n) {
  const cpu = n.metrics?.cpuPercent ?? 0;
  const ram = n.metrics?.memLimitMB > 0
    ? Math.round((n.metrics.memMB / n.metrics.memLimitMB) * 100)
    : 0;
  return {
    id: n.id,
    label: n.name.split('.')[0],
    role: (n.isLeader || n.type === 'orderer') ? 'master' : 'slave',
    status: n.status ?? 'unknown',
    cpu,
    ram,
    type: n.type,
    organization: n.organization,
    port: n.port,
    lastSeen: n.lastSeen,
    image: n.metrics?.image,
  };
}

export default function Network() {
  const [canvasNodes, setCanvasNodes] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadTopology = useCallback(async () => {
    try {
      const [topoRes, healthRes] = await Promise.all([
        networkApi.topology(),
        networkApi.health(),
      ]);
      const mapped = topoRes.data.nodes.map(toCanvasNode);
      setCanvasNodes(mapped);
      setHealth(healthRes.data);
      setLastRefresh(new Date());
      // Sync selected node data when topology refreshes
      setSelectedNode((prev) => prev ? (mapped.find((n) => n.id === prev.id) ?? null) : null);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadTopology();
    const iv = setInterval(loadTopology, 30_000);
    return () => clearInterval(iv);
  }, [loadTopology]);

  const gs = health?.status ?? 'unknown';
  const onlineCount = canvasNodes.filter((n) => n.status === 'online').length;

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Canvas area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 relative bg-ink-900 overflow-hidden">

        {/* Header bar */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
          <div className="glass-surface shadow-glass rounded-lg px-4 py-2.5 flex items-center gap-2.5 pointer-events-auto">
            <Radio className="w-4 h-4 text-brand" />
            <span className="text-sm font-semibold text-ink-50">Topologie réseau</span>
            {!loading && (
              <span className="text-xs text-ink-400 ml-1">
                {canvasNodes.length} nœuds · {onlineCount} en ligne
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            {health && (
              <div className={`glass-surface shadow-glass rounded-lg px-3 py-2 flex items-center gap-2 text-xs font-medium ${
                gs === 'healthy' ? 'text-emerald-400'
                : gs === 'degraded' ? 'text-amber-400'
                : 'text-ink-300'
              }`}>
                <span className={`w-2 h-2 rounded-full status-pulse ${
                  gs === 'healthy' ? 'bg-emerald-400'
                  : gs === 'degraded' ? 'bg-amber-400'
                  : 'bg-ink-400'
                }`} />
                {gs === 'healthy' ? 'Réseau sain' : gs === 'degraded' ? 'Dégradé' : 'Inconnu'}
                <span className="text-ink-500 font-normal">({health.online}/{health.total})</span>
              </div>
            )}
            <button
              onClick={loadTopology}
              disabled={loading}
              className="glass-surface shadow-glass rounded-lg px-3 py-2 flex items-center gap-1.5 text-xs text-ink-300 hover:text-ink-50 transition-colors disabled:opacity-40"
            >
              {loading
                ? <Loader2 size={13} className="animate-spin" />
                : <RefreshCw size={13} />}
              {lastRefresh ? lastRefresh.toLocaleTimeString('fr-FR') : 'Actualiser'}
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-10">
          <NetworkLegend />
        </div>

        {/* Zoom hint */}
        <div className="absolute bottom-4 right-4 z-10 glass-surface shadow-glass rounded-lg px-3 py-2 text-[11px] text-ink-400 select-none">
          Molette pour zoomer · Glisser pour déplacer · Clic sur un nœud
        </div>

        {/* Canvas / empty states */}
        {loading && canvasNodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={28} className="animate-spin text-brand" />
          </div>
        ) : canvasNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-ink-400">
            <Radio size={40} className="mb-3 opacity-25" />
            <p className="text-sm font-medium">Aucun nœud détecté</p>
            <p className="text-xs text-ink-500 mt-1">Vérifiez que le réseau Fabric est démarré</p>
          </div>
        ) : (
          <NetworkCanvas
            nodes={canvasNodes}
            onNodeClick={setSelectedNode}
            onNodeHover={(node, x, y) => setHoveredNode(node ? { node, x, y } : null)}
            selectedNodeId={selectedNode?.id ?? null}
          />
        )}
      </div>

      {/* ── Details panel (slide-in) ─────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedNode && (
          <NodeDetailsPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Hover tooltip (portal-like fixed pos) ───────────────────────────── */}
      {hoveredNode && (
        <NodeTooltip
          node={hoveredNode.node}
          x={hoveredNode.x}
          y={hoveredNode.y}
        />
      )}
    </div>
  );
}
