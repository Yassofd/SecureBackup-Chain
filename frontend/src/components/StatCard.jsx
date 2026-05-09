import clsx from 'clsx';

const palette = {
  cyan:   { accent: '#00b4d8', bg: 'bg-brand/10',      icon: 'text-brand',      bar: 'bg-brand'      },
  green:  { accent: '#10b981', bg: 'bg-emerald-500/10', icon: 'text-emerald-400', bar: 'bg-emerald-400' },
  amber:  { accent: '#f59e0b', bg: 'bg-amber-500/10',  icon: 'text-amber-400',  bar: 'bg-amber-400'  },
  red:    { accent: '#ef4444', bg: 'bg-red-500/10',    icon: 'text-red-400',    bar: 'bg-red-400'    },
  purple: { accent: '#8b5cf6', bg: 'bg-purple-500/10', icon: 'text-purple-400', bar: 'bg-purple-400' },
  indigo: { accent: '#6366f1', bg: 'bg-indigo-500/10', icon: 'text-indigo-400', bar: 'bg-indigo-400' },
  blue:   { accent: '#3b82f6', bg: 'bg-blue-500/10',   icon: 'text-blue-400',   bar: 'bg-blue-400'   },
};

export default function StatCard({ label, value, icon: Icon, color = 'cyan', sub }) {
  const c = palette[color] ?? palette.cyan;
  return (
    /* InfluxDB "cell" style : accent top-border + dark bg */
    <div
      className="bg-ink-700 border border-ink-500 rounded-xl overflow-hidden"
      style={{ borderTopColor: c.accent, borderTopWidth: '2px' }}
    >
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-ink-300 uppercase tracking-widest">{label}</p>
          <div className={clsx('p-1.5 rounded-lg', c.bg)}>
            <Icon size={14} className={c.icon} />
          </div>
        </div>
        <p className={clsx('text-[28px] font-bold leading-none font-mono', c.icon)}>{value}</p>
        {sub && <p className="text-[11px] text-ink-300 mt-2 truncate font-mono">{sub}</p>}
      </div>
      {/* Thin accent bar at the bottom — InfluxDB visual detail */}
      <div className={clsx('h-[2px] w-full opacity-40', c.bar)} />
    </div>
  );
}
