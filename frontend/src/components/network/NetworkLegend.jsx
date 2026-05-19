export function NetworkLegend() {
  return (
    <div className="glass-surface shadow-glass rounded-lg px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        <span className="text-ink-300">En ligne</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="text-ink-300">Synchronisation</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="text-ink-300">Hors ligne</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full bg-purple-500/25 flex items-center justify-center">
          <span className="text-[8px] text-purple-400">♛</span>
        </div>
        <span className="text-ink-300">Leader</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="border-t border-dashed border-brand/50" style={{ width: 16 }} />
        <span className="text-ink-300">Connexion</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-brand/60" />
        <span className="text-ink-300">Paquet</span>
      </div>
    </div>
  );
}
