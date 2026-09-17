import clsx from 'clsx';
import { useTheme } from '../context/ThemeContext';
import { STAT } from '../theme/palette';

export default function StatCard({ label, value, icon: Icon, color = 'cyan', sub }) {
  const { theme } = useTheme();
  const set = STAT[theme];
  const c = set[color] ?? set.brand;

  return (
    <div
      className="relative overflow-hidden rounded-xl border transition-all duration-200 group cursor-default"
      style={{
        background: 'rgb(var(--c-ink-700))',
        borderColor: 'rgb(var(--c-ink-500) / 0.7)',
        boxShadow: '0 4px 24px rgb(var(--c-shadow)), inset 0 1px 0 rgb(var(--c-inset-top))',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = c.hoverBorder;
        e.currentTarget.style.boxShadow = `${c.glow}, 0 4px 24px rgb(var(--c-shadow)), inset 0 1px 0 rgb(var(--c-inset-top))`;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgb(var(--c-ink-500) / 0.7)';
        e.currentTarget.style.boxShadow = '0 4px 24px rgb(var(--c-shadow)), inset 0 1px 0 rgb(var(--c-inset-top))';
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
