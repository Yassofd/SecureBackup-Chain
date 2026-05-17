import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  Cpu, HardDrive, Wifi, Activity, CheckCircle, XCircle,
  AlertTriangle, Bell, X, RefreshCw, Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import { backupsApi, networkApi } from '../services/api';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function ts() { return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

function useLiveSeries(base, variance, intervalMs = 3000) {
  const [data, setData] = useState(() =>
    Array.from({ length: 30 }, (_, i) => ({
      t: new Date(Date.now() - (29 - i) * intervalMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      v: +(base + (Math.random() - 0.4) * variance).toFixed(1),
    }))
  );
  const ref = useRef(true);
  useEffect(() => {
    ref.current = true;
    const iv = setInterval(() => {
      if (!ref.current) return;
      setData((prev) => {
        const last = prev[prev.length - 1].v;
        const next = Math.max(0, +(last + (Math.random() - 0.48) * (variance * 0.35)).toFixed(1));
        return [...prev.slice(1), { t: ts(), v: next }];
      });
    }, intervalMs);
    return () => { ref.current = false; clearInterval(iv); };
  }, [base, variance, intervalMs]);
  return data;
}

/* ── Custom tooltip ──────────────────────────────────────────────────────── */
function ChartTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ink-800 border border-ink-600 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-ink-300 font-mono mb-1">{label}</p>
      <p className="text-brand font-semibold">{payload[0]?.value}{unit}</p>
    </div>
  );
}

/* ── Live metric gauge ───────────────────────────────────────────────────── */
function MetricGauge({ label, value, unit, warn, crit, color, icon: Icon }) {
  const pct = Math.min(100, (value / crit) * 100);
  const severity = value >= crit ? 'crit' : value >= warn ? 'warn' : 'ok';
  const barColor = severity === 'crit' ? '#ef4444' : severity === 'warn' ? '#f59e0b' : color;
  const textColor = severity === 'crit' ? 'text-red-400' : severity === 'warn' ? 'text-amber-400' : 'text-ink-100';

  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-ink-700/60 last:border-0">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${barColor}15` }}>
        <Icon size={16} style={{ color: barColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-ink-200">{label}</span>
          <span className={clsx('text-sm font-bold font-mono tabular-nums', textColor)}>
            {value}{unit}
          </span>
        </div>
        <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: barColor, boxShadow: `0 0 8px ${barColor}60` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-ink-500 font-mono">
          <span>warn {warn}{unit}</span>
          <span>crit {crit}{unit}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Alert feed ──────────────────────────────────────────────────────────── */
const INITIAL_ALERTS = [
  { id: 1, sev: 'warning',  title: 'IPFS pin queue saturée',      source: 'ipfs-cluster',  time: new Date(Date.now() - 900_000),  ack: false },
  { id: 2, sev: 'info',     title: 'Backup planifié complété',    source: 'scheduler',     time: new Date(Date.now() - 1800_000), ack: true  },
  { id: 3, sev: 'critical', title: 'Fabric peer latence élevée',  source: 'peer0.org1',   time: new Date(Date.now() - 3600_000), ack: false },
  { id: 4, sev: 'info',     title: 'Rotation de tokens JWT',      source: 'auth-service',  time: new Date(Date.now() - 7200_000), ack: true  },
];

const SEV_CFG = {
  critical: { color: 'text-red-400',    bg: 'bg-red-500/10',    icon: XCircle,       border: 'border-red-500/20' },
  warning:  { color: 'text-amber-400',  bg: 'bg-amber-500/10',  icon: AlertTriangle, border: 'border-amber-500/20' },
  info:     { color: 'text-brand',      bg: 'bg-brand/10',      icon: Bell,          border: 'border-brand/20' },
};

function AlertFeed({ alerts, onAck, onDismiss }) {
  const unread = alerts.filter((a) => !a.ack).length;
  return (
    <div className="panel flex flex-col h-full">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Bell size={13} className="text-amber-400" />
          <span className="panel-title">Alertes actives</span>
          {unread > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500/15 text-red-400 border border-red-500/20">{unread}</span>
          )}
        </div>
        <span className="text-xs text-ink-300 font-mono">{alerts.length} total</span>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-ink-700/60">
        {alerts.map((a) => {
          const cfg = SEV_CFG[a.sev];
          const Icon = cfg.icon;
          return (
            <div key={a.id} className={clsx('flex items-start gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors', !a.ack && 'bg-brand/[0.02]')}>
              <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', cfg.bg, 'border', cfg.border)}>
                <Icon size={14} className={cfg.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded border', cfg.bg, cfg.color, cfg.border)}>
                    {a.sev.toUpperCase()}
                  </span>
                  <span className="text-sm font-medium text-ink-100">{a.title}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-ink-400 font-mono">
                  <span>{a.source}</span>
                  <span>·</span>
                  <span>{a.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  {a.ack && <span className="text-emerald-400 flex items-center gap-0.5"><CheckCircle size={10} /> Acquitté</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!a.ack && (
                  <button onClick={() => onAck(a.id)}
                    className="h-7 px-2.5 text-[11px] font-medium rounded-md bg-brand/10 text-brand border border-brand/20 hover:bg-brand/20 transition-colors">
                    Acquitter
                  </button>
                )}
                <button onClick={() => onDismiss(a.id)}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-ink-400 hover:text-ink-100 hover:bg-ink-600 transition-colors">
                  <X size={13} />
                </button>
              </div>
            </div>
          );
        })}
        {alerts.length === 0 && (
          <div className="py-10 text-center">
            <CheckCircle size={24} className="text-emerald-400/40 mx-auto mb-2" />
            <p className="text-sm text-ink-400">Aucune alerte active</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] } } };

export default function Monitoring() {
  const [health, setHealth]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts]   = useState(INITIAL_ALERTS);

  /* Live metric series */
  const cpuData    = useLiveSeries(62, 15);
  const ramData    = useLiveSeries(74, 10);
  const diskData   = useLiveSeries(312, 60, 5000);
  const latData    = useLiveSeries(8.4, 3, 4000);

  /* Simulated live gauge values */
  const [gauges, setGauges] = useState({ cpu: 62, ram: 74, disk: 312, lat: 8.4 });
  useEffect(() => {
    const iv = setInterval(() => {
      setGauges((prev) => ({
        cpu:  Math.max(1, Math.min(100, +(prev.cpu  + (Math.random() - 0.5) * 6).toFixed(1))),
        ram:  Math.max(1, Math.min(100, +(prev.ram  + (Math.random() - 0.5) * 4).toFixed(1))),
        disk: Math.max(0, +(prev.disk + (Math.random() - 0.5) * 30).toFixed(0)),
        lat:  Math.max(0.5, +(prev.lat + (Math.random() - 0.5) * 2).toFixed(1)),
      }));
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  /* Real health data */
  async function loadHealth() {
    try {
      const [sysRes, netRes] = await Promise.allSettled([backupsApi.health(), networkApi.health()]);
      setHealth({
        sys: sysRes.status === 'fulfilled' ? sysRes.value.data : null,
        net: netRes.status === 'fulfilled' ? netRes.value.data : null,
      });
    } finally { setLoading(false); }
  }

  useEffect(() => { loadHealth(); const iv = setInterval(loadHealth, 30_000); return () => clearInterval(iv); }, []);

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Monitoring</h1>
          <p className="page-sub">Métriques système en temps réel — mise à jour toutes les 2s</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 badge-green">
            <span className="dot-live" /> Live
          </span>
          <button onClick={loadHealth} disabled={loading} className="btn-outline flex items-center gap-1.5">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Actualiser
          </button>
        </div>
      </motion.div>

      {/* Real-time service status */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Hyperledger Fabric', ok: health?.sys?.fabric === 'ok', loading },
          { label: 'IPFS Cluster',       ok: health?.sys?.ipfs   === 'ok', loading },
          { label: 'Base de données',    ok: health?.sys?.database !== 'error', loading },
          { label: `Réseau (${health?.net?.online ?? '?'}/${health?.net?.total ?? '?'})`, ok: health?.net?.status === 'healthy', loading },
        ].map(({ label, ok, loading: l }) => (
          <div key={label} className={clsx('panel px-4 py-3 flex items-center gap-3', ok ? 'border-emerald-500/20' : 'border-red-500/20')}>
            {l ? <Loader2 size={14} className="animate-spin text-ink-400" /> :
              ok ? <CheckCircle size={14} className="text-emerald-400 shrink-0" /> : <XCircle size={14} className="text-red-400 shrink-0" />}
            <span className="text-xs font-medium text-ink-100 truncate">{label}</span>
          </div>
        ))}
      </motion.div>

      {/* Gauge cards */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Ressources système</span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-400"><span className="dot-live" /> Temps réel</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <MetricGauge label="CPU" value={gauges.cpu} unit="%" warn={75} crit={90} color="#00b4d8" icon={Cpu} />
            <MetricGauge label="Mémoire" value={gauges.ram} unit="%" warn={80} crit={95} color="#8b5cf6" icon={Activity} />
            <MetricGauge label="I/O disque" value={gauges.disk} unit=" MB/s" warn={400} crit={480} color="#10b981" icon={HardDrive} />
            <MetricGauge label="Latence réseau" value={gauges.lat} unit=" ms" warn={20} crit={50} color="#f59e0b" icon={Wifi} />
          </div>
        </div>
      </motion.div>

      {/* Live charts grid */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {[
          { title: 'CPU Usage', data: cpuData, color: '#00b4d8', unit: '%', warn: 75, crit: 90, gradId: 'grad-cpu' },
          { title: 'Memory Usage', data: ramData, color: '#8b5cf6', unit: '%', warn: 80, crit: 95, gradId: 'grad-ram' },
        ].map(({ title, data, color, unit, warn, crit, gradId }) => (
          <div key={title} className="panel flex flex-col" style={{ minHeight: 220 }}>
            <div className="panel-header">
              <div>
                <span className="panel-title">{title}</span>
                <p className="text-[10px] text-ink-400 mt-0.5">30 dernières minutes</p>
              </div>
              <span className={clsx('text-lg font-bold font-mono tabular-nums', data[data.length - 1]?.v >= crit ? 'text-red-400' : data[data.length - 1]?.v >= warn ? 'text-amber-400' : 'text-ink-100')}>
                {data[data.length - 1]?.v}{unit}
              </span>
            </div>
            <div className="flex-1 p-4 min-h-0" style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(48,48,88,0.5)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#6565a0' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: '#6565a0' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: `${color}40`, strokeWidth: 1 }} />
                  <ReferenceLine y={warn} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <ReferenceLine y={crit} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: color }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Disk I/O + Latency */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {[
          { title: 'Disk I/O', data: diskData, color: '#10b981', unit: ' MB/s', warn: 400, crit: 480, gradId: 'grad-disk' },
          { title: 'Latence réseau', data: latData, color: '#f59e0b', unit: ' ms', warn: 20, crit: 50, gradId: 'grad-lat' },
        ].map(({ title, data, color, unit, warn, crit, gradId }) => (
          <div key={title} className="panel flex flex-col" style={{ minHeight: 220 }}>
            <div className="panel-header">
              <div>
                <span className="panel-title">{title}</span>
                <p className="text-[10px] text-ink-400 mt-0.5">30 dernières minutes</p>
              </div>
              <span className="text-lg font-bold font-mono tabular-nums text-ink-100">
                {data[data.length - 1]?.v}{unit}
              </span>
            </div>
            <div className="flex-1 p-4 min-h-0" style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(48,48,88,0.5)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#6565a0' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: '#6565a0' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: `${color}40`, strokeWidth: 1 }} />
                  <ReferenceLine y={warn} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <ReferenceLine y={crit} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: color }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Alert feed */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} style={{ minHeight: 320 }}>
        <AlertFeed
          alerts={alerts}
          onAck={(id) => setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, ack: true } : a))}
          onDismiss={(id) => setAlerts((prev) => prev.filter((a) => a.id !== id))}
        />
      </motion.div>
    </div>
  );
}
