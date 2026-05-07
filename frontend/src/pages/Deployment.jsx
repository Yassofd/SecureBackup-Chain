import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Server, Wifi, WifiOff, Download, Play, RefreshCw,
  CheckCircle, XCircle, Clock, Terminal, Plus, X,
  ChevronRight, Key, Lock, AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';

const BASE = '/api';
const token = () => localStorage.getItem('accessToken');

// ── Constantes ────────────────────────────────────────────────────────────────
const NODE_META = [
  { num: 1, org: 'Org1', label: 'Nœud 1', color: 'indigo',
    services: [['Orderer', 7050], ['Peer', 7051], ['CA', 7054], ['IPFS', 5001]] },
  { num: 2, org: 'Org2', label: 'Nœud 2', color: 'violet',
    services: [['Orderer', 8050], ['Peer', 8051], ['CA', 8054], ['IPFS', 5002]] },
  { num: 3, org: 'Org3', label: 'Nœud 3', color: 'purple',
    services: [['Orderer', 9050], ['Peer', 9051], ['CA', 9054], ['IPFS', 5003]] },
];

const C = {
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-700', btn: 'bg-indigo-600 hover:bg-indigo-700' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-700', btn: 'bg-violet-600 hover:bg-violet-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700', btn: 'bg-purple-600 hover:bg-purple-700' },
};

// ── Composants ────────────────────────────────────────────────────────────────
function StatusDot({ status }) {
  if (status === 'testing') return <Clock size={13} className="text-amber-400 animate-pulse" />;
  if (status === true)      return <CheckCircle size={13} className="text-green-500" />;
  if (status === false)     return <XCircle size={13} className="text-red-400" />;
  return <div className="w-3 h-3 rounded-full bg-gray-200" />;
}

function Input({ label, ...props }) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>}
      <input
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        {...props}
      />
    </div>
  );
}

// ── Modal : Déploiement SSH ───────────────────────────────────────────────────
function DeployModal({ defaultOrg, ips, onClose, onSuccess }) {
  const [form, setForm] = useState({
    orgNum:      defaultOrg || 2,
    sshHost:     '',
    sshPort:     22,
    sshUser:     'root',
    authType:    'password',
    sshPassword: '',
    sshKey:      '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [jobId,      setJobId]      = useState(null);
  const [events,     setEvents]     = useState([]);
  const [status,     setStatus]     = useState('idle');  // idle | running | done | error
  const [progress,   setProgress]   = useState(0);
  const logsRef = useRef(null);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [events]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.sshHost || !form.sshUser) return;
    setSubmitting(true);
    try {
      const resp = await fetch(`${BASE}/deployment/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          orgNum:      form.orgNum,
          sshHost:     form.sshHost,
          sshPort:     form.sshPort,
          sshUser:     form.sshUser,
          sshPassword: form.authType === 'password' ? form.sshPassword : undefined,
          sshKey:      form.authType === 'key'      ? form.sshKey      : undefined,
          networkIps:  { org1: ips.org1, org2: ips.org2, org3: ips.org3 },
        }),
      });
      const { jobId: id } = await resp.json();
      setJobId(id);
      setStatus('running');
    } catch (e) {
      setEvents(ev => [...ev, { type: 'ERROR', text: e.message }]);
      setStatus('error');
    }
    setSubmitting(false);
  };

  // Stream SSE du job
  useEffect(() => {
    if (!jobId) return;
    const reader = fetch(`${BASE}/deployment/jobs/${jobId}/stream`, {
      headers: { Authorization: `Bearer ${token()}` },
    }).then(r => r.body.getReader());

    let buf = '';
    const decoder = new TextDecoder();

    reader.then(rd => {
      const STEP_PCT = { connect: 5, docker: 12, mkdir: 18, certs: 50, artifacts: 60, compose: 65, chaincode: 70, env: 72, pull: 82, start: 90, join: 96, done: 100 };

      const read = () => rd.read().then(({ done, value }) => {
        if (done) return;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.log)  setEvents(e => [...e, { type: evt.step === 'error' ? 'ERROR' : evt.success ? 'SUCCESS' : 'LOG', text: evt.log }]);
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Déployer un nœud via SSH</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Formulaire (caché pendant le déploiement) */}
          {status === 'idle' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Nœud à déployer</label>
                <div className="grid grid-cols-3 gap-2">
                  {[2, 3].map(n => (
                    <button key={n}
                      onClick={() => set('orgNum', n)}
                      className={clsx(
                        'border rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        form.orgNum === n ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 hover:border-gray-300',
                      )}>
                      Nœud {n} (Org{n})
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">Le Nœud 1 (Org1) est local. Seuls Org2 et Org3 sont déployables à distance.</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Input label="Hôte SSH (IP ou DNS) *" value={form.sshHost}
                    onChange={e => set('sshHost', e.target.value)} placeholder="192.168.1.10" />
                </div>
                <Input label="Port SSH" type="number" value={form.sshPort}
                  onChange={e => set('sshPort', Number(e.target.value))} />
              </div>

              <Input label="Utilisateur SSH *" value={form.sshUser}
                onChange={e => set('sshUser', e.target.value)} placeholder="root" />

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Authentification</label>
                <div className="flex gap-2 mb-3">
                  {[['password', 'Mot de passe', Lock], ['key', 'Clé privée', Key]].map(([val, label, Icon]) => (
                    <button key={val} onClick={() => set('authType', val)}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors',
                        form.authType === val ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 hover:border-gray-300',
                      )}>
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
                {form.authType === 'password' ? (
                  <Input label="" type="password" value={form.sshPassword}
                    onChange={e => set('sshPassword', e.target.value)} placeholder="Mot de passe SSH" />
                ) : (
                  <textarea
                    value={form.sshKey}
                    onChange={e => set('sshKey', e.target.value)}
                    placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;…"
                    rows={4}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                )}
              </div>
            </>
          )}

          {/* Barre de progression */}
          {status !== 'idle' && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-500">
                <span>
                  {status === 'running' && 'Déploiement en cours…'}
                  {status === 'done'    && `Nœud ${form.orgNum} déployé avec succès`}
                  {status === 'error'   && 'Erreur lors du déploiement'}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={clsx(
                  'h-full rounded-full transition-all duration-500',
                  status === 'error' ? 'bg-red-500' : status === 'done' ? 'bg-green-500' : 'bg-indigo-600',
                )}
                  style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Terminal de logs */}
          {events.length > 0 && (
            <div className="bg-slate-900 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Terminal size={11} className="text-slate-400" />
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Logs SSH</span>
                {status === 'running' && <RefreshCw size={10} className="text-amber-400 animate-spin ml-auto" />}
              </div>
              <div ref={logsRef} className="max-h-52 overflow-y-auto space-y-0.5 font-mono text-xs">
                {events.map((e, i) => (
                  <div key={i} className={clsx(
                    e.type === 'SUCCESS' ? 'text-green-400'
                    : e.type === 'ERROR' ? 'text-red-400'
                    : 'text-slate-300',
                  )}>
                    {e.text}
                  </div>
                ))}
                {status === 'running' && <span className="text-slate-500 animate-pulse">…</span>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
            {status === 'done' ? 'Fermer' : 'Annuler'}
          </button>
          {status === 'idle' && (
            <button
              onClick={submit}
              disabled={submitting || !form.sshHost || !form.sshUser}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? <><RefreshCw size={13} className="animate-spin" /> Envoi…</> : <><Play size={13} /> Déployer</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Deployment() {
  const [ips,       setIps]      = useState({ org1: 'localhost', org2: '', org3: '' });
  const [results,   setResults]  = useState({});
  const [testing,   setTesting]  = useState(false);
  const [testDone,  setTestDone] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [defaultOrg, setDefaultOrg] = useState(2);
  const [downloading, setDownloading] = useState({});
  const esRef = useRef(null);

  // ── Connectivity SSE ────────────────────────────────────────────────────────
  const runTest = useCallback(() => {
    if (esRef.current) esRef.current.close();
    setResults({}); setTestDone(false); setTesting(true);

    const params = new URLSearchParams({ org1: ips.org1, org2: ips.org2 || ips.org1, org3: ips.org3 || ips.org1 });
    const es = new EventSource(`/api/setup/connectivity/stream?${params}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.done) { setTesting(false); setTestDone(true); es.close(); return; }
      setResults(prev => ({ ...prev, [`${data.node}-${data.service}`]: data }));
    };
    es.onerror = () => { setTesting(false); es.close(); };
  }, [ips]);

  useEffect(() => () => esRef.current?.close(), []);

  // ── Download package ────────────────────────────────────────────────────────
  const downloadPackage = async (nodeNum) => {
    setDownloading(d => ({ ...d, [nodeNum]: true }));
    try {
      const res = await fetch(`/api/setup/download/node/${nodeNum}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) { alert((await res.json()).error); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `securebackup-node${nodeNum}.tar.gz`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); }
    setDownloading(d => ({ ...d, [nodeNum]: false }));
  };

  // ── Stats globales ──────────────────────────────────────────────────────────
  const total     = Object.keys(results).length;
  const reachable = Object.values(results).filter(r => r.reachable).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Déploiement multi-machines</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ajoutez des nœuds Fabric sur des machines distantes via SSH</p>
        </div>
        <button onClick={() => { setDefaultOrg(2); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          <Plus size={15} /> Ajouter un nœud
        </button>
      </div>

      {/* Configuration des IPs */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Server size={14} /> IPs des machines
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {NODE_META.map(({ num, org, label, color }) => (
            <div key={num}>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {label} ({org}) {num === 1 ? '— cette machine' : '— machine distante'}
              </label>
              <input
                type="text"
                value={ips[`org${num}`]}
                onChange={e => setIps(p => ({ ...p, [`org${num}`]: e.target.value }))}
                placeholder={num === 1 ? 'localhost' : `192.168.1.${num + 9}`}
                className={clsx('w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300', C[color].border)}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={runTest} disabled={testing}
            className="flex items-center gap-2 px-5 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
            {testing ? <><RefreshCw size={13} className="animate-spin" /> Test en cours…</> : <><Wifi size={13} /> Tester la connectivité</>}
          </button>
          {testDone && (
            <span className={clsx('text-sm font-medium px-3 py-1 rounded-full',
              reachable === total ? 'bg-green-100 text-green-700' : reachable > total / 2 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
              {reachable}/{total} ports accessibles
            </span>
          )}
        </div>
      </div>

      {/* Cartes par nœud */}
      <div className="grid grid-cols-3 gap-4">
        {NODE_META.map(({ num, org, label, color, services }) => {
          const c = C[color];
          return (
            <div key={num} className={clsx('rounded-xl border p-4 space-y-3', c.bg, c.border)}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={clsx('text-xs font-bold uppercase tracking-wide', c.text)}>{label}</p>
                  <p className="text-xs text-gray-500">{ips[`org${num}`] || 'IP non configurée'}</p>
                </div>
                <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', c.badge)}>{org}</span>
              </div>

              {/* Services + connectivité */}
              <div className="space-y-1.5">
                {services.map(([name, port]) => {
                  const key = `${num}-${name}`;
                  const r   = results[key];
                  const status = testing && !r ? 'testing' : r?.reachable;
                  return (
                    <div key={name} className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <StatusDot status={status} />
                        <span className="text-xs font-medium text-gray-700">{name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {r?.latencyMs && <span className="text-[10px] text-gray-400">{r.latencyMs}ms</span>}
                        <span className="text-[10px] text-gray-400 font-mono">{port}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-white/40 flex gap-2">
                {num === 1 ? (
                  <div className="flex-1 text-center text-xs text-gray-400 py-1.5">Nœud local</div>
                ) : (
                  <button
                    onClick={() => { setDefaultOrg(num); setShowModal(true); }}
                    className={clsx('flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white', c.btn)}>
                    <Plus size={11} /> Déployer
                  </button>
                )}
                <button
                  onClick={() => downloadPackage(num)}
                  disabled={downloading[num]}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white/80 hover:bg-white border border-gray-200 rounded-lg text-xs text-gray-600 disabled:opacity-50"
                  title="Télécharger le package .tar.gz"
                >
                  {downloading[num] ? <RefreshCw size={11} className="animate-spin" /> : <Download size={11} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Aide ports firewall */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 mb-1">Ports à ouvrir sur les machines distantes</p>
            <div className="grid grid-cols-3 gap-4 text-xs text-amber-700">
              <div><p className="font-semibold mb-0.5">Nœud 2 (Org2)</p><p>8050 Orderer · 8051 Peer · 8054 CA · 5002 IPFS · 4002 Swarm</p></div>
              <div><p className="font-semibold mb-0.5">Nœud 3 (Org3)</p><p>9050 Orderer · 9051 Peer · 9054 CA · 5003 IPFS · 4003 Swarm</p></div>
              <div><p className="font-semibold mb-0.5">SSH (entrant)</p><p>Port 22 requis pour le déploiement depuis le Nœud 1</p></div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal déploiement */}
      {showModal && (
        <DeployModal
          defaultOrg={defaultOrg}
          ips={ips}
          onClose={() => setShowModal(false)}
          onSuccess={() => setTimeout(() => setShowModal(false), 2000)}
        />
      )}
    </div>
  );
}
