import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, HardDrive, CheckCircle, LayoutDashboard, LogOut,
  Server, CloudUpload, CalendarClock, Bell, ClipboardList, Network,
  Boxes, Activity, ChevronLeft, ChevronRight, Search, Settings,
  Users, ShieldCheck, Cpu, RotateCcw, Command,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { notificationsApi } from '../services/api';

/* ── Nav structure ──────────────────────────────────────────────────────────── */
const NAV_GROUPS = [
  {
    label: 'Données',
    items: [
      { to: '/',              label: 'Dashboard',      icon: LayoutDashboard },
      { to: '/backups',       label: 'Sauvegardes',    icon: HardDrive },
      { to: '/remote-backup', label: 'Distante',       icon: CloudUpload },
      { to: '/schedules',     label: 'Planifications', icon: CalendarClock },
      { to: '/verify',        label: 'Vérifier',       icon: CheckCircle },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { to: '/network',    label: 'Réseau',      icon: Network },
      { to: '/deployment', label: 'Déploiement', icon: Boxes },
      { to: '/monitoring', label: 'Monitoring',  icon: Activity },
      { to: '/ssh-servers',label: 'Serveurs SSH',icon: Server },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/audit',    label: 'Audit',      icon: ClipboardList },
      { to: '/users',    label: 'Utilisateurs',icon: Users },
      { to: '/security', label: 'Sécurité',   icon: ShieldCheck },
      { to: '/settings', label: 'Paramètres', icon: Settings },
    ],
  },
];

const roleLabel = { admin: 'Admin', responsable: 'Responsable', auditeur: 'Auditeur' };
const roleBadge = {
  admin:       'bg-red-500/15    text-red-400    border border-red-500/25',
  responsable: 'bg-brand/15     text-brand      border border-brand/25',
  auditeur:    'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
};

/* ── Sidebar nav item ────────────────────────────────────────────────────────── */
function NavItem({ to, label, icon: Icon, collapsed }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={collapsed ? label : undefined}
      className={({ isActive }) => clsx(
        'flex items-center gap-3 py-2.5 text-[13px] font-medium transition-all duration-150 group rounded-lg mx-2',
        collapsed ? 'justify-center px-2' : 'pl-3 pr-4',
        isActive
          ? 'text-brand bg-brand/10 border border-brand/20'
          : 'text-ink-200 hover:text-ink-50 hover:bg-white/[0.04] border border-transparent',
      )}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={15}
            className={clsx(
              'shrink-0 transition-colors duration-150',
              isActive ? 'text-brand drop-shadow-[0_0_6px_rgba(0,180,216,0.8)]' : 'text-ink-400 group-hover:text-ink-200',
            )}
          />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden whitespace-nowrap"
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
        </>
      )}
    </NavLink>
  );
}

/* ── Notification bell ───────────────────────────────────────────────────────── */
function NotificationBell({ collapsed }) {
  const [unread, setUnread]  = useState(0);
  const [notifications, setNot] = useState([]);
  const [open, setOpen]      = useState(false);
  const ref = useRef(null);

  async function load() {
    try {
      const { data } = await notificationsApi.list();
      setUnread(data.unreadCount);
      setNot(data.notifications.slice(0, 8));
    } catch (_) {}
  }

  useEffect(() => { load(); const iv = setInterval(load, 30_000); return () => clearInterval(iv); }, []);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  async function markAll() { await notificationsApi.markAllRead(); load(); }

  const typeColor = {
    backup_success:    'text-emerald-400',
    schedule_success:  'text-emerald-400',
    integrity_failure: 'text-red-400',
    schedule_error:    'text-red-400',
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        className="relative p-2 text-ink-300 hover:text-ink-50 hover:bg-white/[0.06] rounded-lg transition-colors"
        title="Notifications"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-glow-pulse"
            style={{ boxShadow: '0 0 6px rgba(239,68,68,0.8)' }} />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -8, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-full ml-2 bottom-0 w-80 bg-ink-700/95 backdrop-blur-sm border border-ink-500/70 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-ink-500/50 bg-ink-800/80">
              <span className="text-xs font-semibold text-ink-50 uppercase tracking-wide">Notifications</span>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button onClick={markAll} className="text-xs text-brand hover:text-brand-300 transition-colors">
                    Tout lire
                  </button>
                )}
                <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs text-ink-300 hover:text-ink-100 transition-colors">
                  Voir tout →
                </Link>
              </div>
            </div>
            {notifications.length === 0 ? (
              <p className="text-ink-300 text-xs text-center py-8">Aucune notification</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {notifications.map((n) => (
                  <li key={n.id} className={clsx('px-4 py-3 border-b border-ink-600/60 last:border-0 transition-colors hover:bg-white/[0.02]', !n.read && 'bg-brand/[0.04]')}>
                    <p className={clsx('text-xs font-semibold', typeColor[n.type] || 'text-ink-50')}>{n.title}</p>
                    <p className="text-xs text-ink-200 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-ink-300 mt-1 font-mono">{new Date(n.createdAt).toLocaleString('fr-FR')}</p>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Top search/command bar ──────────────────────────────────────────────────── */
function TopBar({ onOpenCommand }) {
  const location = useLocation();

  const crumbs = {
    '/':              'Dashboard',
    '/backups':       'Sauvegardes',
    '/remote-backup': 'Sauvegarde distante',
    '/schedules':     'Planifications',
    '/verify':        'Vérification',
    '/network':       'Réseau',
    '/deployment':    'Déploiement',
    '/monitoring':    'Monitoring',
    '/ssh-servers':   'Serveurs SSH',
    '/audit':         'Audit',
    '/users':         'Utilisateurs',
    '/security':      'Sécurité',
    '/settings':      'Paramètres',
    '/notifications': 'Notifications',
  };

  const pageTitle = crumbs[location.pathname] || 'SecureBackup';

  return (
    <div
      className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-ink-700/80"
      style={{ background: 'rgba(11,11,24,0.85)', backdropFilter: 'blur(12px)' }}
    >
      <div className="flex-1">
        <h2 className="text-sm font-semibold text-ink-100 tracking-tight">{pageTitle}</h2>
      </div>

      {/* Search / Command palette trigger */}
      <button
        onClick={onOpenCommand}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ink-700/60 border border-ink-600/60 text-ink-400 hover:text-ink-200 hover:border-ink-500 transition-all text-xs"
      >
        <Search size={12} />
        <span className="hidden sm:inline">Rechercher…</span>
        <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-ink-600 text-[10px] font-mono text-ink-300">
          <Command size={9} />K
        </kbd>
      </button>
    </div>
  );
}

/* ── Command palette ─────────────────────────────────────────────────────────── */
const ALL_PAGES = [
  { label: 'Dashboard',       to: '/',              icon: LayoutDashboard },
  { label: 'Sauvegardes',     to: '/backups',       icon: HardDrive },
  { label: 'Distante',        to: '/remote-backup', icon: CloudUpload },
  { label: 'Planifications',  to: '/schedules',     icon: CalendarClock },
  { label: 'Vérifier',        to: '/verify',        icon: CheckCircle },
  { label: 'Réseau',          to: '/network',       icon: Network },
  { label: 'Déploiement',     to: '/deployment',    icon: Boxes },
  { label: 'Monitoring',      to: '/monitoring',    icon: Activity },
  { label: 'Serveurs SSH',    to: '/ssh-servers',   icon: Server },
  { label: 'Audit',           to: '/audit',         icon: ClipboardList },
  { label: 'Utilisateurs',    to: '/users',         icon: Users },
  { label: 'Sécurité',        to: '/security',      icon: ShieldCheck },
  { label: 'Paramètres',      to: '/settings',      icon: Settings },
];

function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('');
  const inputRef  = useRef(null);
  const location  = useLocation();

  useEffect(() => {
    if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  const results = q.trim()
    ? ALL_PAGES.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()))
    : ALL_PAGES;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -8 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-md bg-ink-800 border border-ink-600 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-ink-600">
          <Search size={14} className="text-ink-400 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Naviguer vers…"
            className="flex-1 bg-transparent text-sm text-ink-50 placeholder:text-ink-400 outline-none"
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          />
          <kbd className="px-1.5 py-0.5 rounded bg-ink-700 text-[10px] font-mono text-ink-400">ESC</kbd>
        </div>
        <div className="py-2 max-h-80 overflow-y-auto">
          {results.map(({ label, to, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              className={clsx(
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-brand/10 hover:text-brand group',
                location.pathname === to ? 'text-brand bg-brand/8' : 'text-ink-200',
              )}
            >
              <Icon size={14} className="text-ink-400 group-hover:text-brand transition-colors shrink-0" />
              {label}
              {location.pathname === to && <span className="ml-auto text-[10px] text-brand font-mono">actuel</span>}
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/* ── Layout principal ────────────────────────────────────────────────────────── */
export default function Layout() {
  const { user, logout }      = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  // Keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-ink-900">

      {/* ── Sidebar ───────────────────────────────────────────────────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 68 : 228 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        className="h-screen flex flex-col shrink-0 border-r border-ink-700/80 relative z-20"
        style={{ background: 'linear-gradient(180deg, #0a0a18 0%, #080810 100%)' }}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-ink-700/80 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(0,180,216,0.25) 0%, rgba(139,92,246,0.16) 100%)',
                border: '1px solid rgba(0,180,216,0.3)',
                boxShadow: '0 0 18px rgba(0,180,216,0.22), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              <Shield size={15} className="text-brand" style={{ filter: 'drop-shadow(0 0 5px rgba(0,180,216,0.7))' }} />
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden min-w-0"
                >
                  <p className="text-[13px] font-bold text-ink-50 leading-none tracking-tight whitespace-nowrap">SecureBackup</p>
                  <p className="text-[10px] text-ink-400 mt-0.5 font-mono tracking-wide whitespace-nowrap">Chain Edition</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <AnimatePresence>
                {!collapsed && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="section-title mt-1 mb-1"
                  >
                    {group.label}
                  </motion.p>
                )}
              </AnimatePresence>
              {collapsed && <div className="h-px bg-ink-700/60 mx-3 mb-2 mt-1" />}
              {group.items.map((item) => (
                <NavItem key={item.to} {...item} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        {user && (
          <div className={clsx('px-3 py-3 border-t border-ink-700/80 shrink-0', collapsed && 'px-2')}>
            {!collapsed ? (
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, rgba(0,180,216,0.2) 0%, rgba(139,92,246,0.15) 100%)',
                    border: '1px solid rgba(0,180,216,0.25)',
                  }}
                >
                  <span className="text-[11px] font-bold text-brand">{user.email?.[0]?.toUpperCase()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-ink-100 truncate font-medium">{user.email}</p>
                  <span className={clsx('text-[9px] px-1.5 py-px rounded font-semibold uppercase tracking-wide', roleBadge[user.role])}>
                    {roleLabel[user.role]}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <NotificationBell />
                  <button
                    onClick={logout}
                    className="p-2 text-ink-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Se déconnecter"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <NotificationBell />
                <button
                  onClick={logout}
                  className="p-2 text-ink-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Se déconnecter"
                >
                  <LogOut size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-16 w-6 h-6 bg-ink-700 border border-ink-600 rounded-full flex items-center justify-center text-ink-300 hover:text-ink-50 hover:bg-ink-600 transition-all shadow-md z-30"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </motion.aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onOpenCommand={() => setCmdOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-ink-900">
          <Outlet />
        </main>
      </div>

      {/* Command palette */}
      <AnimatePresence>
        {cmdOpen && <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
