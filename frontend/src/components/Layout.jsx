import { NavLink, Outlet, Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import {
  Shield, HardDrive, CheckCircle, LayoutDashboard, LogOut,
  Server, CloudUpload, CalendarClock, Bell, ClipboardList, Network, Boxes,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { notificationsApi } from '../services/api';

const NAV_MAIN = [
  { to: '/',            label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/backups',     label: 'Sauvegardes',    icon: HardDrive },
  { to: '/remote-backup', label: 'Distante',     icon: CloudUpload },
  { to: '/schedules',  label: 'Planifications',  icon: CalendarClock },
  { to: '/verify',     label: 'Vérifier',        icon: CheckCircle },
];
const NAV_INFRA = [
  { to: '/ssh-servers',  label: 'Serveurs SSH',  icon: Server },
  { to: '/audit',        label: 'Audit',         icon: ClipboardList },
  { to: '/network',      label: 'Réseau',        icon: Network },
  { to: '/deployment',   label: 'Déploiement',   icon: Boxes },
];

const roleLabel = { admin: 'Admin', responsable: 'Responsable', auditeur: 'Auditeur' };
const roleBadge = {
  admin:       'bg-red-500/15    text-red-400    border border-red-500/20',
  responsable: 'bg-brand/15     text-brand      border border-brand/20',
  auditeur:    'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
};

/* ── Item sidebar ────────────────────────────────────────────────────────────── */
function NavItem({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => clsx(
        /* InfluxDB style : left 3px accent bar, full-width, no rounded corners */
        'flex items-center gap-3 py-2.5 pr-4 text-[13px] font-medium transition-colors group',
        'border-l-[3px]',
        isActive
          ? 'pl-[13px] border-brand bg-brand/[0.09] text-brand'
          : 'pl-[13px] border-transparent text-ink-200 hover:text-ink-50 hover:bg-white/[0.04]',
      )}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={15}
            className={clsx(
              'shrink-0 transition-colors',
              isActive ? 'text-brand' : 'text-ink-400 group-hover:text-ink-200',
            )}
          />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

/* ── Notification bell ───────────────────────────────────────────────────────── */
function NotificationBell() {
  const [unread, setUnread]      = useState(0);
  const [notifications, setNot] = useState([]);
  const [open, setOpen]          = useState(false);
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
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
        )}
      </button>

      {open && (
        <div className="absolute left-full ml-2 top-0 w-80 bg-ink-700 border border-ink-500 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-500 bg-ink-800">
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
            <ul>
              {notifications.map((n) => (
                <li key={n.id} className={clsx('px-4 py-3 border-b border-ink-600 last:border-0', !n.read && 'bg-brand/[0.04]')}>
                  <p className={clsx('text-xs font-semibold', typeColor[n.type] || 'text-ink-50')}>{n.title}</p>
                  <p className="text-xs text-ink-200 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-ink-300 mt-1 font-mono">{new Date(n.createdAt).toLocaleString('fr-FR')}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Layout principal ────────────────────────────────────────────────────────── */
export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-ink-900">

      {/* ── Sidebar ───────────────────────────────────────────────────────────── */}
      <aside className="w-[220px] bg-ink-950 flex flex-col shrink-0 border-r border-ink-700">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-ink-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand/15 border border-brand/25 rounded-lg flex items-center justify-center shrink-0">
              <Shield size={15} className="text-brand" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-ink-50 leading-none tracking-tight">SecureBackup</p>
              <p className="text-[10px] text-ink-400 mt-0.5 font-mono tracking-wide">Chain Edition</p>
            </div>
          </div>
        </div>

        {/* Navigation — no x-padding on container so border-l spans full width */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <p className="section-title mt-1 mb-1">Données</p>
          {NAV_MAIN.map((item) => <NavItem key={item.to} {...item} />)}

          <p className="section-title mt-4 mb-1">Infrastructure</p>
          {NAV_INFRA.map((item) => <NavItem key={item.to} {...item} />)}
        </nav>

        {/* User footer */}
        {user && (
          <div className="px-4 py-3 border-t border-ink-700">
            <div className="flex items-center gap-2">
              {/* Avatar */}
              <div className="w-7 h-7 rounded-lg bg-brand/20 border border-brand/30 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-brand">
                  {user.email?.[0]?.toUpperCase()}
                </span>
              </div>
              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-ink-100 truncate font-medium">{user.email}</p>
                <span className={clsx('text-[9px] px-1.5 py-px rounded font-semibold uppercase tracking-wide', roleBadge[user.role])}>
                  {roleLabel[user.role]}
                </span>
              </div>
              {/* Actions */}
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
          </div>
        )}
      </aside>

      {/* ── Content ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-ink-900">
        <Outlet />
      </main>
    </div>
  );
}
