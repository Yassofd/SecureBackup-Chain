import clsx from 'clsx';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import MiniSparkline from './MiniSparkline';
import { useTheme } from '../../context/ThemeContext';
import { STAT } from '../../theme/palette';

/**
 * MetricCard — enhanced stat card with sparkline and trend.
 * Props:
 *   label, value, icon, color, sub
 *   change     — string like "+12.4%" or "-1 node"
 *   trend      — "up" | "down" | "neutral"
 *   sparkData  — array of numbers for sparkline
 */
export default function MetricCard({ label, value, icon: Icon, color = 'cyan', sub, change, trend = 'neutral', sparkData }) {
  const { theme } = useTheme();
  const set = STAT[theme];
  const c = set[color] ?? set.brand;

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-ink-400';

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
      {/* Gradient tint */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: c.gradient }} />
      {/* Accent top border */}
      <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl"
        style={{ background: `linear-gradient(90deg, ${c.accent} 0%, transparent 60%)` }} />

      <div className="relative px-5 pt-5 pb-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-ink-300 uppercase tracking-widest">{label}</p>
          <div className={clsx('p-1.5 rounded-lg', c.iconBg)}>
            <Icon size={14} className={c.icon} />
          </div>
        </div>

        {/* Value */}
        <p className={clsx('text-[28px] font-bold leading-none font-mono tracking-tight', c.icon)}>{value}</p>

        {/* Sparkline */}
        {sparkData && sparkData.length > 1 && (
          <div className="mt-3 -mx-1">
            <MiniSparkline data={sparkData} color={c.accent} height={36} />
          </div>
        )}

        {/* Footer: change + sub */}
        <div className="flex items-center justify-between mt-2.5">
          {change && (
            <span className={clsx('flex items-center gap-1 text-[11px] font-medium', trendColor)}>
              <TrendIcon size={11} />
              {change}
            </span>
          )}
          {sub && <p className="text-[11px] text-ink-300 truncate font-mono ml-auto">{sub}</p>}
        </div>
      </div>
    </div>
  );
}
