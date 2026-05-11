import clsx from 'clsx';

const palette = {
  cyan:   {
    accent: '#00b4d8',
    icon:   'text-brand',
    iconBg: 'bg-brand/10 border border-brand/20',
    glow:   '0 0 24px rgba(0,180,216,0.18)',
    hoverBorder: 'rgba(0,180,216,0.4)',
    gradient: 'radial-gradient(ellipse at top left, rgba(0,180,216,0.09) 0%, transparent 65%)',
  },
  green:  {
    accent: '#10b981',
    icon:   'text-emerald-400',
    iconBg: 'bg-emerald-500/10 border border-emerald-500/20',
    glow:   '0 0 24px rgba(16,185,129,0.18)',
    hoverBorder: 'rgba(16,185,129,0.4)',
    gradient: 'radial-gradient(ellipse at top left, rgba(16,185,129,0.09) 0%, transparent 65%)',
  },
  amber:  {
    accent: '#f59e0b',
    icon:   'text-amber-400',
    iconBg: 'bg-amber-500/10 border border-amber-500/20',
    glow:   '0 0 24px rgba(245,158,11,0.16)',
    hoverBorder: 'rgba(245,158,11,0.4)',
    gradient: 'radial-gradient(ellipse at top left, rgba(245,158,11,0.08) 0%, transparent 65%)',
  },
  red:    {
    accent: '#ef4444',
    icon:   'text-red-400',
    iconBg: 'bg-red-500/10 border border-red-500/20',
    glow:   '0 0 24px rgba(239,68,68,0.18)',
    hoverBorder: 'rgba(239,68,68,0.4)',
    gradient: 'radial-gradient(ellipse at top left, rgba(239,68,68,0.08) 0%, transparent 65%)',
  },
  purple: {
    accent: '#8b5cf6',
    icon:   'text-purple-400',
    iconBg: 'bg-purple-500/10 border border-purple-500/20',
    glow:   '0 0 24px rgba(139,92,246,0.18)',
    hoverBorder: 'rgba(139,92,246,0.4)',
    gradient: 'radial-gradient(ellipse at top left, rgba(139,92,246,0.09) 0%, transparent 65%)',
  },
  indigo: {
    accent: '#6366f1',
    icon:   'text-indigo-400',
    iconBg: 'bg-indigo-500/10 border border-indigo-500/20',
    glow:   '0 0 24px rgba(99,102,241,0.18)',
    hoverBorder: 'rgba(99,102,241,0.4)',
    gradient: 'radial-gradient(ellipse at top left, rgba(99,102,241,0.09) 0%, transparent 65%)',
  },
  blue:   {
    accent: '#3b82f6',
    icon:   'text-blue-400',
    iconBg: 'bg-blue-500/10 border border-blue-500/20',
    glow:   '0 0 24px rgba(59,130,246,0.18)',
    hoverBorder: 'rgba(59,130,246,0.4)',
    gradient: 'radial-gradient(ellipse at top left, rgba(59,130,246,0.09) 0%, transparent 65%)',
  },
};

export default function StatCard({ label, value, icon: Icon, color = 'cyan', sub }) {
  const c = palette[color] ?? palette.cyan;

  return (
    <div
      className="relative overflow-hidden rounded-xl border transition-all duration-200 group cursor-default"
      style={{
        background: '#1c1c36',
        borderColor: 'rgba(50,50,90,0.7)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = c.hoverBorder;
        e.currentTarget.style.boxShadow = `${c.glow}, 0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(50,50,90,0.7)';
        e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Gradient tint en haut à gauche */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: c.gradient }}
      />

      {/* Thin accent top border */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl"
        style={{ background: `linear-gradient(90deg, ${c.accent} 0%, transparent 60%)` }}
      />

      <div className="relative px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-semibold text-ink-300 uppercase tracking-widest">{label}</p>
          <div className={clsx('p-1.5 rounded-lg', c.iconBg)}>
            <Icon size={14} className={c.icon} />
          </div>
        </div>

        <p className={clsx('text-[32px] font-bold leading-none font-mono tracking-tight', c.icon)}>
          {value}
        </p>

        {sub && (
          <p className="text-[11px] text-ink-300 mt-2.5 truncate font-mono">{sub}</p>
        )}
      </div>
    </div>
  );
}
