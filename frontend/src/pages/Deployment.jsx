import { useState, useRef, useEffect } from 'react';
import {
  Server, Wifi, WifiOff, Download, Play, RefreshCw,
  CheckCircle, XCircle, Clock, Terminal, Package, Copy,
} from 'lucide-react';
import clsx from 'clsx';
const BASE_URL = '/api/setup';

// ── Utilitaires ───────────────────────────────────────────────────────────────

const NODE_META = [
  { num: 1, org: 'Org1', label: 'Nœud 1',  color: 'indigo', services: ['Orderer:7050', 'Peer:7051', 'CA:7054', 'IPFS API:5001'] },
  { num: 2, org: 'Org2', label: 'Nœud 2',  color: 'violet', services: ['Orderer:8050', 'Peer:8051', 'CA:8054', 'IPFS API:5002'] },
  { num: 3, org: 'Org3', label: 'Nœud 3',  color: 'purple', services: ['Orderer:9050', 'Peer:9051', 'CA:9054', 'IPFS API:5003'] },
];

const COLOR = {
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-700' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
};

function StatusDot({ status }) {
  if (status === 'testing') return <Clock size={14} className="text-amber-500 animate-spin" />;
  if (status === true)     return <CheckCircle size={14} className="text-green-500" />;
  if (status === false)    return <XCircle size={14} className="text-red-400" />;
  return <div className="w-3.5 h-3.5 rounded-full bg-gray-200" />;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} title="Copier" className="text-gray-400 hover:text-gray-700 transition-colors">
      {copied ? <CheckCircle size={13} className="text-green-500" /> : <Copy size={13} />}
    </button>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function Deployment() {
  const token = localStorage.getItem('accessToken');

  const [ips, setIps] = useState({ org1: 'localhost', org2: 'localhost', org3: 'localhost' });
  const [results, setResults] = useState({});   // key: "node-service-port" → { reachable, latencyMs }
  const [testing, setTesting] = useState(false);
  const [done, setDone] = useState(false);
  const [downloading, setDownloading] = useState({});
  const [logs, setLogs] = useState([]);
  const logsRef = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  // ── SSE connectivity test ─────────────────────────────────────────────────
  const runTest = () => {
    if (esRef.current) esRef.current.close();
    setResults({});
    setDone(false);
    setLogs([]);
    setTesting(true);

    const params = new URLSearchParams({ org1: ips.org1, org2: ips.org2, org3: ips.org3 });
    const es = new EventSource(`${BASE_URL}/connectivity/stream?${params}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.done) {
        setTesting(false);
        setDone(true);
        es.close();
        return;
      }
      const key = `${data.node}-${data.service}`;
      setResults((prev) => ({ ...prev, [key]: data }));
      setLogs((prev) => [
        ...prev,
        `${data.reachable ? '✓' : '✗'} ${data.org} ${data.service} (${data.host}:${data.port})${data.latencyMs ? ` — ${data.latencyMs}ms` : ''}`,
      ]);
    };

    es.onerror = () => {
      setTesting(false);
      setLogs((prev) => [...prev, '✗ Erreur de connexion au serveur SSE']);
      es.close();
    };
  };

  useEffect(() => () => esRef.current?.close(), []);

  // ── Download package ──────────────────────────────────────────────────────
  const downloadPackage = async (nodeNum) => {
    setDownloading((d) => ({ ...d, [nodeNum]: true }));
    try {
      const res = await fetch(`${BASE_URL}/download/node/${nodeNum}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Erreur : ${err.error}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `securebackup-node${nodeNum}.tar.gz`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Erreur de téléchargement : ${e.message}`);
    } finally {
      setDownloading((d) => ({ ...d, [nodeNum]: false }));
    }
  };

  const downloadWizard = () => {
    const a = document.createElement('a');
    a.href = `${BASE_URL}/wizard`;
    a.download = 'setup-wizard.sh';
    a.click();
  };

  // ── Stats globales ────────────────────────────────────────────────────────
  const total    = Object.keys(results).length;
  const reachable = Object.values(results).filter((r) => r.reachable).length;
  const pct = total > 0 ? Math.round((reachable / total) * 100) : 0;

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Déploiement multi-machines</h1>
          <p className="text-sm text-gray-500 mt-0.5">Phase 13 — Distribuer les nœuds sur des machines distinctes</p>
        </div>
        <button
          onClick={downloadWizard}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700"
        >
          <Terminal size={15} /> Télécharger setup-wizard.sh
        </button>
      </div>

      {/* Configuration des IPs */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Server size={15} /> Configuration réseau
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {NODE_META.map(({ num, org, label, color }) => (
            <div key={num}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {label} ({org}) — IP ou hostname
              </label>
              <input
                type="text"
                value={ips[`org${num}`]}
                onChange={(e) => setIps((p) => ({ ...p, [`org${num}`]: e.target.value }))}
                placeholder="192.168.1.x"
                className={clsx(
                  'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300',
                  COLOR[color].border,
                )}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={runTest}
            disabled={testing}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {testing
              ? <><RefreshCw size={14} className="animate-spin" /> Test en cours…</>
              : <><Play size={14} /> Tester la connectivité</>
            }
          </button>
          {done && (
            <span className={clsx(
              'text-sm font-medium px-3 py-1 rounded-full',
              pct === 100 ? 'bg-green-100 text-green-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700',
            )}>
              {reachable}/{total} ports accessibles ({pct}%)
            </span>
          )}
        </div>
      </div>

      {/* Matrice de connectivité */}
      <div className="grid grid-cols-3 gap-4">
        {NODE_META.map(({ num, org, label, color, services }) => {
          const c = COLOR[color];
          return (
            <div key={num} className={clsx('rounded-xl border p-4', c.bg, c.border)}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className={clsx('text-xs font-bold uppercase tracking-wide', c.text)}>{label}</span>
                  <p className="text-xs text-gray-500">{ips[`org${num}`]}</p>
                </div>
                <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', c.badge)}>{org}</span>
              </div>

              <div className="space-y-2">
                {services.map((svc) => {
                  const [name, port] = svc.split(':');
                  const key = `${num}-${name}`;
                  const r = results[key];
                  const status = testing && !r ? 'testing' : r?.reachable;

                  return (
                    <div key={svc} className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <StatusDot status={status} />
                        <span className="text-xs font-medium text-gray-700">{name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {r?.latencyMs && (
                          <span className="text-[10px] text-gray-400">{r.latencyMs}ms</span>
                        )}
                        <span className="text-[10px] text-gray-400 font-mono">{port}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-3 border-t border-white/40 flex gap-2">
                <button
                  onClick={() => downloadPackage(num)}
                  disabled={downloading[num]}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/80 hover:bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 disabled:opacity-50"
                >
                  {downloading[num]
                    ? <><RefreshCw size={11} className="animate-spin" /> Téléchargement…</>
                    : <><Package size={11} /> Package .tar.gz</>
                  }
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Logs temps réel */}
      {logs.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
              <Terminal size={12} /> Logs en temps réel
            </span>
            {testing && <RefreshCw size={12} className="text-amber-400 animate-spin" />}
          </div>
          <div ref={logsRef} className="max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
            {logs.map((line, i) => (
              <div key={i} className={clsx(
                line.startsWith('✓') ? 'text-green-400' : line.startsWith('✗') ? 'text-red-400' : 'text-slate-400',
              )}>
                {line}
              </div>
            ))}
            {testing && <div className="text-amber-400 animate-pulse">…</div>}
          </div>
        </div>
      )}

      {/* Instructions de déploiement */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
        <h2 className="text-sm font-semibold text-gray-700">Instructions de déploiement</h2>

        {[
          {
            step: 1,
            title: 'Transférer les fichiers depuis cette machine',
            cmd: `rsync -avz --exclude='node_modules' --exclude='volumes' \\\n  /opt/securebackup-chain/ USER@<IP_CIBLE>:/opt/securebackup-chain/`,
          },
          {
            step: 2,
            title: 'Ou télécharger le wizard directement sur la machine cible',
            cmd: `curl -fsSL http://<IP_MACHINE1>:3000/api/setup/wizard -o setup-wizard.sh\nbash setup-wizard.sh --node 2 --org1-ip ${ips.org1} --org2-ip ${ips.org2} --org3-ip ${ips.org3}`,
          },
          {
            step: 3,
            title: 'Démarrer le nœud manuellement (si déjà transféré)',
            cmd: `cd /opt/securebackup-chain/network\nbash setup-wizard.sh --node 2 --skip-transfer`,
          },
          {
            step: 4,
            title: 'Vérifier les logs Raft après démarrage',
            cmd: `docker logs orderer.org2.example.com 2>&1 | grep -E 'leader|raft|election'`,
          },
        ].map(({ step, title, cmd }) => (
          <div key={step} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold shrink-0">
                {step}
              </span>
              <span className="text-sm font-medium text-gray-700">{title}</span>
            </div>
            <div className="relative ml-7">
              <pre className="bg-slate-900 text-green-400 text-xs rounded-lg px-4 py-3 font-mono overflow-x-auto whitespace-pre-wrap">
                {cmd}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={cmd} />
              </div>
            </div>
          </div>
        ))}

        {/* Ports à ouvrir */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">Ports à ouvrir sur les firewalls</p>
          <div className="grid grid-cols-3 gap-4 text-xs text-amber-700">
            <div>
              <p className="font-semibold mb-1">Nœud 1 (Org1)</p>
              <p>7050 — Orderer gRPC</p>
              <p>7051 — Peer gRPC</p>
              <p>7054 — CA HTTPS</p>
              <p>5001 — IPFS API</p>
              <p>4001 — IPFS Swarm</p>
            </div>
            <div>
              <p className="font-semibold mb-1">Nœud 2 (Org2)</p>
              <p>8050 — Orderer gRPC</p>
              <p>8051 — Peer gRPC</p>
              <p>8054 — CA HTTPS</p>
              <p>5002 — IPFS API</p>
              <p>4002 — IPFS Swarm</p>
            </div>
            <div>
              <p className="font-semibold mb-1">Nœud 3 (Org3)</p>
              <p>9050 — Orderer gRPC</p>
              <p>9051 — Peer gRPC</p>
              <p>9054 — CA HTTPS</p>
              <p>5003 — IPFS API</p>
              <p>4003 — IPFS Swarm</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
