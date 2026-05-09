import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Server, Play, RefreshCw, CheckCircle, XCircle, Clock,
  Terminal, Plus, X, Key, Lock, AlertTriangle, Trash2, Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import { deploymentApi } from '../services/api';

const BASE  = '/api';
const token = () => localStorage.getItem('accessToken');

const STATUS_LABEL = { running: 'Actif', deploying: 'Déploiement', error: 'Erreur', stopped: 'Arrêté' };
const STATUS_COLOR = {
  running:   'badge-green',
  deploying: 'badge-amber',
  error:     'bg-red-500/15 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 text-xs font-medium',
  stopped:   'badge-blue',
};

const NODE_ACCENTS = [
  '#00b4d8', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
  '#3b82f6', '#ec4899', '#14b8a6', '#f97316',
];

function DeployModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    sshHost: '', sshPort: 22, sshUser: 'root',
    authType: 'password', sshPassword: '', sshKey: '',
    nodeIp: '', node1Ip: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [jobId,      setJobId]      = useState(null);
  const [events,     setEvents]     = useState([]);
  const [status,     setStatus]     = useState('idle');
  const [progress,   setProgress]   = useState(0);
  const [assignedOrg, setAssignedOrg] = useState(null);
  const logsRef = useRef(null);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [events]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.sshHost || !form.sshUser || !form.nodeIp || !form.node1Ip) return;
    setSubmitting(true);
    try {
      const resp = await fetch(`${BASE}/deployment/nodes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          sshHost:     form.sshHost,
          sshPort:     form.sshPort,
          sshUser:     form.sshUser,
          sshPassword: form.authType === 'password' ? form.sshPassword : undefined,
          sshKey:      form.authType === 'key'      ? form.sshKey      : undefined,
          nodeIp:      form.nodeIp,
          node1Ip:     form.node1Ip,
        }),
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
    const STEP_PCT = { connect: 4, crypto: 10, channel: 20, docker: 26, mkdir: 32, certs: 55, artifacts: 62, compose: 67, chaincode: 72, env: 74, pull: 84, start: 92, join: 95, ccinstall: 97, update_node1: 99, done: 100 };
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
            if (evt.log)  setEvents((e) => [...e, { type: evt.step === 'error' ? 'ERROR' : evt.success ? 'SUCCESS' : evt.warn ? 'WARN' : 'LOG', text: evt.log }]);
            if (evt.step) setProgress(STEP_PCT[evt.step] || 0);
            if (evt.done) { setStatus(evt.status === 'error' ? 'error' : 'done'); if (evt.status !== 'error') onSuccess?.(); }
          } catch (_) {}
        }
        read();
      }).catch(() => setStatus('error'));
      read();
    });
  }, [jobId]);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-ink-700 border border-ink-500 rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-500">
          <h2 className="text-sm font-semibold text-ink-50">
            Déployer un nouveau nœud
            {assignedOrg && <span className="ml-2 text-xs font-normal text-brand">(Org{assignedOrg})</span>}
          </h2>
          <button onClick={onClose} className="p-1.5 text-ink-300 hover:text-ink-50 hover:bg-ink-600 rounded-lg transition-colors"><X size={15} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {status === 'idle' && (
            <>
              <div className="bg-brand/10 border border-brand/20 rounded-lg p-3 text-xs text-brand/90">
                Le numéro d'org est assigné automatiquement. Renseignez les IPs des deux machines et les accès SSH de la machine distante.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">IP de ce serveur (Nœud 1) *</label>
                  <input value={form.node1Ip} onChange={(e) => set('node1Ip', e.target.value)}
                    className="input font-mono" placeholder="192.168.1.10" />
                </div>
                <div>
                  <label className="label">IP du nœud distant *</label>
                  <input value={form.nodeIp} onChange={(e) => set('nodeIp', e.target.value)}
                    className="input font-mono" placeholder="192.168.1.20" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="label">Hôte SSH *</label>
                  <input value={form.sshHost} onChange={(e) => set('sshHost', e.target.value)}
                    className="input font-mono" placeholder="192.168.1.20" />
                </div>
                <div>
                  <label className="label">Port SSH</label>
                  <input type="number" value={form.sshPort} onChange={(e) => set('sshPort', Number(e.target.value))}
                    className="input" />
                </div>
              </div>

              <div>
                <label className="label">Utilisateur SSH *</label>
                <input value={form.sshUser} onChange={(e) => set('sshUser', e.target.value)}
                  className="input" placeholder="root" />
              </div>

              <div>
                <label className="label mb-2">Authentification</label>
                <div className="flex gap-2 mb-3">
                  {[['password', 'Mot de passe', Lock], ['key', 'Clé privée', Key]].map(([val, label, Icon]) => (
                    <button key={val} onClick={() => set('authType', val)}
                      className={clsx('flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors',
                        form.authType === val
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-ink-500 text-ink-300 hover:border-ink-400 hover:text-ink-100')}>
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
                {form.authType === 'password'
                  ? <input type="password" value={form.sshPassword} onChange={(e) => set('sshPassword', e.target.value)}
                      className="input" placeholder="Mot de passe SSH" />
                  : <textarea value={form.sshKey} onChange={(e) => set('sshKey', e.target.value)}
                      placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;…" rows={4}
                      className="w-full bg-ink-600 border border-ink-500 rounded-lg px-3 py-2 text-xs font-mono text-ink-100 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/60 resize-none" />
                }
              </div>
            </>
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
                <div className={clsx('h-full rounded-full transition-all duration-500',
                  status === 'error' ? 'bg-red-500' : status === 'done' ? 'bg-emerald-500' : 'bg-brand')}
                  style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {events.length > 0 && (
            <div className="bg-ink-900 border border-ink-600 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Terminal size={11} className="text-ink-400" />
                <span className="text-xs text-ink-400 font-semibold uppercase tracking-wider">Logs SSH</span>
                {status === 'running' && <Loader2 size={10} className="text-brand animate-spin ml-auto" />}
              </div>
              <div ref={logsRef} className="max-h-52 overflow-y-auto space-y-0.5 font-mono text-xs">
                {events.map((e, i) => (
                  <div key={i} className={clsx(
                    e.type === 'SUCCESS' ? 'text-emerald-400' : e.type === 'ERROR' ? 'text-red-400' : e.type === 'WARN' ? 'text-amber-400' : 'text-ink-200',
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
            <button onClick={submit}
              disabled={submitting || !form.sshHost || !form.sshUser || !form.nodeIp || !form.node1Ip}
              className="btn-primary flex items-center gap-2">
              {submitting ? <><Loader2 size={13} className="animate-spin" /> Envoi…</> : <><Play size={13} /> Déployer</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NodeCard({ node, accent, onDelete }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Supprimer Org${node.orgNum} du registre ? (les conteneurs distants ne seront pas arrêtés)`)) return;
    setDeleting(true);
    try {
      await deploymentApi.deleteNode(node.id);
      onDelete();
    } catch (_) { setDeleting(false); }
  };

  const statusCls = STATUS_COLOR[node.status] || STATUS_COLOR.stopped;

  return (
    <div className="card p-4 space-y-3 hover:border-ink-400 transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
            <p className="text-xs font-bold uppercase tracking-wide text-ink-50">Nœud {node.orgNum}</p>
          </div>
          <p className="text-xs text-ink-400 font-mono mt-0.5">{node.ip}</p>
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
        <span className={statusCls}>{STATUS_LABEL[node.status] || node.status}</span>
        <button onClick={handleDelete} disabled={deleting}
          className="p-1.5 text-ink-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40"
          title="Retirer du registre">
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      </div>
    </div>
  );
}

export default function Deployment() {
  const [nodes,     setNodes]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);

  const loadNodes = useCallback(async () => {
    try {
      const { data } = await deploymentApi.listNodes();
      setNodes(data);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { loadNodes(); }, [loadNodes]);

  const localNode = { orgNum: 1, orgName: 'Org1', ip: 'localhost', status: 'running',
    peerPort: 7051, ordererPort: 7050, caPort: 7054, ipfsPort: 5001 };
  const allNodes  = nodes.some((n) => n.orgNum === 1) ? nodes : [localNode, ...nodes];

  return (
    <div className="p-7 max-w-6xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Déploiement multi-machines</h1>
          <p className="page-sub">
            {allNodes.length} nœud{allNodes.length > 1 ? 's' : ''} dans le réseau — ajoutez-en autant que vous voulez
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
          {allNodes.map((node, i) => (
            <NodeCard
              key={node.id || node.orgNum}
              node={node}
              accent={NODE_ACCENTS[i % NODE_ACCENTS.length]}
              onDelete={loadNodes}
            />
          ))}
        </div>
      )}

      <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-400/90">
            <p className="font-semibold text-amber-400 mb-1">Ports à ouvrir sur chaque machine distante</p>
            <p>Orderer, Peer, CA, IPFS sont calculés dynamiquement selon le numéro d'org. Le port SSH (22) doit être accessible depuis ce serveur.</p>
            <p className="mt-1 font-mono text-amber-400/70">OrgN → Orderer: 6000+N×1000+50 · Peer: +51 · CA: +54 · IPFS: 5000+N</p>
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
