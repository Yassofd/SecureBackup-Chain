import { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';

function ts() { return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ink-800 border border-ink-600 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-ink-300 mb-1 font-mono">{label}</p>
      <p className="text-brand font-semibold">{payload[0]?.value} req/min</p>
    </div>
  );
};

export default function ThroughputChart() {
  const [data, setData] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      t: ts(),
      v: Math.round(10 + Math.random() * 40),
    }))
  );
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    const iv = setInterval(() => {
      if (!isMounted.current) return;
      setData((prev) => {
        const last = prev[prev.length - 1]?.v ?? 20;
        const next = Math.max(0, Math.round(last + (Math.random() - 0.45) * 12));
        return [...prev.slice(-19), { t: ts(), v: next }];
      });
    }, 3000);
    return () => { isMounted.current = false; clearInterval(iv); };
  }, []);

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header">
        <span className="panel-title flex items-center gap-2"><Activity size={13} className="text-purple-400" /> Activité temps réel</span>
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <span className="dot-live" /> Live
        </span>
      </div>
      <div className="flex-1 p-4 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="grad-purple" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(48,48,88,0.5)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" tick={{ fontSize: 8, fill: '#6565a0' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: '#6565a0' }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(139,92,246,0.3)', strokeWidth: 1 }} />
            <Area type="monotone" dataKey="v" stroke="#8b5cf6" strokeWidth={2}
              fill="url(#grad-purple)" dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: '#8b5cf6' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
