import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Server, Play, CheckCircle, XCircle,
  Terminal, Plus, X, AlertTriangle, Trash2, Loader2, Package, Square,
} from 'lucide-react';
import clsx from 'clsx';
import { deploymentApi } from '../services/api';

const BASE  = '/api';
const token = () => localStorage.getItem('accessToken');

const STATUS_LABEL = { running: 'Actif', deploying: 'Déploiement', error: 'Erreur', stopped: 'Arrêté' };

const NODE_ACCENTS = [
  '#00b4d8', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
  '#3b82f6', '#ec4899', '#14b8a6', '#f97316',
];

const STEP_PCT = {
  crypto: 10, channel: 25, compose: 40,
  pull: 65, start: 85, join: 93, ccinstall: 97, done: 100,
};

function DeployModal({ onClose, onSuccess }) {
  const [status,      setStatus]      = useState('idle');
  const [jobId,       setJobId]       = useState(null);
  const [events,      setEvents]      = useState([]);
  const [progress,    setProgress]    = useState(0);
  const [assignedOrg, setAssignedOrg] = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const logsRef = useRef(null);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [events]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const resp = await fetch(`${BASE}/deployment/nodes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body:    JSON.stringify({}),
      });
      const { jobId: id, orgNum } = await resp.json();
      setJobId(id);
      setAssignedOrg(orgNum);
      setStatus('running');
    } catch (e) {
      setEvents([{ type: 'ERROR', text: e.message }]);
      setStatus('error');
    }
    setSubmitting(false);
  };

  useEffect(() => {
    if (!jobId) return;
    const reader = fetch(`${BASE}/deployment/jobs/${jobId}/stream`, {
      headers: { Authorization: `Bearer ${token()}` },
    }).then((r) => r.body.getReader());

    let buf = '';
    const dec = new TextDecoder();
    reader.then((rd) => {
      const read = () => rd.read().then(({ done, value }) => {
        if (done) return;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.log) {
              const type = evt.step === 'error' ? 'ERROR' : evt.success ? 'SUCCESS' : evt.warn ? 'WARN' : 'LOG';
              setEvents((e) => [...e, { type, text: evt.log }]);
            }
            if (evt.step) setProgress(STEP_PCT[evt.step] || 0);
            if (evt.done) {
              setStatus(evt.status === 'error' ? 'error' : 'done');
              if (evt.status !== 'error') onSuccess?.();
            }
          } catch (_) {}
        }
        read();
      }).catch(() => setStatus('error'));
      read();
    });
  }, [jobId]);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-ink-700 border border-ink-500 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-500">
          <h2 className="text-sm font-semibold text-ink-50">
            Ajouter un nœud
            {assignedOrg && <span className="ml-2 text-xs font-normal text-brand">(Org{assignedOrg})</span>}
          </h2>
          <button onClick={onClose} className="p-1.5 text-ink-300 hover:text-ink-50 hover:bg-ink-600 rounded-lg transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {status === 'idle' && (
            <div className="space-y-4">
              <div className="bg-brand/10 border border-brand/20 rounded-lg p-4 text-xs text-brand/90 space-y-1.5">
                <p className="font-semibold text-brand">Déploiement mono-hôte Docker</p>
                <p>Un nouveau nœud Fabric (orderer + peer + CA) et IPFS sera créé sous forme de conteneurs Docker sur cette machine.</p>
                <p>Le numéro d'organisation est assigné automatiquement. Aucune configuration SSH requise.</p>
              </div>
              <div className="bg-ink-800 border border-ink-600 rounded-lg p-3 text-xs font-mono text-ink-300 space-y-1">
                <p className="text-ink-400 text-[10px] uppercase tracking-wider mb-2">Ce qui sera créé</p>
                <p>• orderer.orgN.example.com</p>
                <p>• peer0.orgN.example.com</p>
                <p>• ca.orgN.example.com</p>
                <p>• ipfsN / clusterN</p>
                <p className="text-ink-500 mt-1">Réseau : securebackup-net (partagé)</p>
              </div>
            </div>
          )}

          {status !== 'idle' && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-ink-300">
                <span>
                  {status === 'running' && 'Déploiement en cours…'}
                  {status === 'done'    && <span className="text-emerald-400">Nœud Org{assignedOrg} déployé avec succès</span>}
                  {status === 'error'   && <span className="text-red-400">Erreur lors du déploiement</span>}
                </span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="h-1.5 bg-ink-600 rounded-full overflow-hidden">
                <div
                  className={clsx('h-full rounded-full transition-all duration-500',
                    status === 'error' ? 'bg-red-500' : status === 'done' ? 'bg-emerald-500' : 'bg-brand')}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {events.length > 0 && (
            <div className="bg-ink-900 border border-ink-600 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Terminal size={11} className="text-ink-400" />
                <span className="text-xs text-ink-400 font-semibold uppercase tracking-wider">Logs</span>
                {status === 'running' && <Loader2 size={10} className="text-brand animate-spin ml-auto" />}
              </div>
              <div ref={logsRef} className="max-h-56 overflow-y-auto space-y-0.5 font-mono text-xs">
                {events.map((e, i) => (
                  <div key={i} className={clsx(
                    e.type === 'SUCCESS' ? 'text-emerald-400'
                    : e.type === 'ERROR' ? 'text-red-400'
                    : e.type === 'WARN'  ? 'text-amber-400'
                    : 'text-ink-200',
                  )}>{e.text}</div>
                ))}
                {status === 'running' && <span className="text-ink-500 animate-pulse">▋</span>}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-ink-500 flex justify-between">
          <button onClick={onClose} className="btn-ghost text-sm">
            {status === 'done' ? 'Fermer' : 'Annuler'}
          </button>
          {status === 'idle' && (
            <button onClick={submit} disabled={submitting} className="btn-primary flex items-center gap-2">
              {submitting
                ? <><Loader2 size={13} className="animate-spin" /> Lancement…</>
                : <><Play size={13} /> Déployer</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NodeCard({ node, accent, onDelete, onStatusChange }) {
  const [deleting,  setDeleting]  = useState(false);
  const [stopping,  setStopping]  = useState(false);
  const [starting,  setStarting]  = useState(false);
  const [actionErr, setActionErr] = useState(null);

  const handleDelete = async () => {
    if (!confirm(`Supprimer Org${node.orgNum} et arrêter ses conteneurs Docker ?`)) return;
    setDeleting(true);
    try {
      await deploymentApi.deleteNode(node.id);
      onDelete();
    } catch (_) { setDeleting(false); }
  };

  const handleStop = async () => {
    setActionErr(null);
    setStopping(true);
    try {
      await deploymentApi.stopNode(node.orgNum);
      onStatusChange(node.orgNum, 'stopped');
    } catch (e) {
      setActionErr(e?.response?.data?.error || e.message || 'Erreur');
    }
    setStopping(false);
  };

  const handleStart = async () => {
    setActionErr(null);
    setStarting(true);
    try {
      await deploymentApi.startNode(node.orgNum);
      onStatusChange(node.orgNum, 'running');
    } catch (e) {
      setActionErr(e?.response?.data?.error || e.message || 'Erreur');
    }
    setStarting(false);
  };

  const isLocal = node.orgNum === 1;
  const canStop  = node.status === 'running';
  const canStart = node.status === 'stopped' || node.status === 'error';

  return (
    <div className="card p-4 space-y-3 hover:border-ink-400 transition-colors">
      {actionErr && (
        <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1 break-all">
          {actionErr}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
            <p className="text-xs font-bold uppercase tracking-wide text-ink-50">Nœud {node.orgNum}</p>
            {isLocal && <span className="text-[10px] text-ink-400 bg-ink-600 px-1.5 py-0.5 rounded">principal</span>}
          </div>
          <p className="text-xs text-ink-400 font-mono mt-0.5">localhost</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium border"
          style={{ color: accent, background: `${accent}18`, borderColor: `${accent}30` }}>
          {node.orgName}
        </span>
      </div>

      <div className="space-y-1.5 text-xs">
        {[
          ['Peer',    node.peerPort],
          ['Orderer', node.ordererPort],
          ['CA',      node.caPort],
          ['IPFS',    node.ipfsPort],
        ].map(([label, port]) => (
          <div key={label} className="flex justify-between">
            <span className="text-ink-400">{label}</span>
            <span className="font-mono text-ink-200">{port ?? '—'}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-ink-600">
        <span className={clsx(
          'text-xs px-2 py-0.5 rounded-full font-medium border',
          node.status === 'running'   ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
          : node.status === 'deploying' ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
          : node.status === 'error'     ? 'text-red-400 bg-red-400/10 border-red-400/20'
          : 'text-ink-400 bg-ink-600 border-ink-500',
        )}>
          {STATUS_LABEL[node.status] || node.status}
        </span>

        <div className="flex items-center gap-1">
          {canStart && (
            <button onClick={handleStart} disabled={starting}
              className="p-1.5 text-ink-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-40"
              title="Démarrer ce nœud">
              {starting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            </button>
          )}
          {canStop && (
            <button onClick={handleStop} disabled={stopping}
              className="p-1.5 text-ink-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-40"
              title="Arrêter ce nœud (conteneurs, données conservées)">
              {stopping ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />}
            </button>
          )}
          {!isLocal && (
            <button onClick={handleDelete} disabled={deleting}
              className="p-1.5 text-ink-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40"
              title="Supprimer ce nœud (arrêt + données effacées)">
              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const LOCAL_NODE_BASE = {
  orgNum: 1, orgName: 'Org1', ip: '127.0.0.1',
  peerPort: 7051, ordererPort: 7050, caPort: 7054, ipfsPort: 5001,
};

export default function Deployment() {
  const [nodes,     setNodes]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);

  const loadNodes = useCallback(async () => {
    try {
      const { data } = await deploymentApi.listNodes();
      setNodes((prev) => {
        if (data.some((n) => n.orgNum === 1)) return data;
        // Org1 n'est pas en DB : conserver son statut actuel ou démarrer à 'running'
        const prevOrg1 = prev.find((n) => n.orgNum === 1);
        return [{ ...LOCAL_NODE_BASE, status: prevOrg1?.status || 'running' }, ...data];
      });
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { loadNodes(); }, [loadNodes]);

  // Mise à jour immédiate du statut d'un nœud dans le state local
  const updateNodeStatus = useCallback((orgNum, status) => {
    setNodes((prev) => prev.map((n) => n.orgNum === orgNum ? { ...n, status } : n));
  }, []);

  return (
    <div className="p-7 max-w-6xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Nœuds du réseau</h1>
          <p className="page-sub">
            {nodes.length} nœud{nodes.length > 1 ? 's' : ''} — tous sur cet hôte Docker
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-1.5">
          <Plus size={14} /> Ajouter un nœud
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-brand" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {nodes.map((node, i) => (
            <NodeCard
              key={node.id || node.orgNum}
              node={node}
              accent={NODE_ACCENTS[i % NODE_ACCENTS.length]}
              onDelete={loadNodes}
              onStatusChange={updateNodeStatus}
            />
          ))}
        </div>
      )}

      <div className="bg-ink-800 border border-ink-600 rounded-xl p-4">
        <div className="flex items-start gap-2.5">
          <Package size={14} className="text-ink-400 mt-0.5 shrink-0" />
          <div className="text-xs text-ink-400 space-y-1">
            <p className="font-semibold text-ink-300">Architecture mono-hôte</p>
            <p>Chaque nœud tourne dans ses propres conteneurs Docker sur cette machine et partage le réseau <span className="font-mono text-ink-200">securebackup-net</span>. Les ports sont alloués automatiquement (Org2 : Peer 8051, Orderer 8050…).</p>
          </div>
        </div>
      </div>

      {showModal && (
        <DeployModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setTimeout(() => { setShowModal(false); loadNodes(); }, 2000); }}
        />
      )}
    </div>
  );
}
