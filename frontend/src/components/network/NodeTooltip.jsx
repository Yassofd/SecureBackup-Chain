const TYPE_LABELS = {
  orderer: 'Orderer', peer: 'Peer', ca: 'CA',
  couchdb: 'CouchDB', ipfs: 'IPFS', chaincode: 'Chaincode',
};

export function NodeTooltip({ node, x, y }) {
  const isOnline = node.status === 'online';
  const isSyncing = node.status === 'syncing';

  return (
    <div
      className="fixed z-50 pointer-events-none glass-surface shadow-glass-md rounded-lg border border-ink-500/40 px-4 py-3 min-w-[210px]"
      style={{ left: x + 16, top: y - 10 }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full ${
          isOnline ? 'bg-emerald-400' : isSyncing ? 'bg-amber-400' : 'bg-red-400'
        }`} />
        <span className="text-sm font-semibold text-ink-50">{node.label}</span>
        {node.role === 'master' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple-500/15 text-purple-400">
            leader
          </span>
        )}
      </div>

      <div className="text-[11px] text-ink-400 mb-2.5">
        {TYPE_LABELS[node.type] ?? node.type ?? '—'}
        {node.organization && <span className="ml-1.5 text-ink-500">· {node.organization}</span>}
      </div>

      {(isOnline || isSyncing) ? (
        <div className="space-y-1.5">
          {node.cpu > 0 && (
            <MetricRow
              label="CPU"
              value={`${node.cpu}%`}
              percent={node.cpu}
              color={node.cpu > 80 ? 'bg-red-400' : node.cpu > 60 ? 'bg-amber-400' : 'bg-emerald-400'}
            />
          )}
          {node.ram > 0 && (
            <MetricRow label="RAM" value={`${node.ram}%`} percent={node.ram} color="bg-purple-400" />
          )}
          {node.cpu === 0 && node.ram === 0 && (
            <div className="text-[11px] text-ink-400">Métriques non disponibles</div>
          )}
        </div>
      ) : (
        <div className="text-xs text-red-400">Nœud injoignable</div>
      )}
    </div>
  );
}

function MetricRow({ label, value, percent, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-ink-400 w-7">{label}</span>
      <div className="flex-1 h-1.5 bg-ink-600/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-ink-100 w-8 text-right">{value}</span>
    </div>
  );
}
