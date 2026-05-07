import { NavLink, Outlet, Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import {
  Shield, HardDrive, CheckCircle, LayoutDashboard, LogOut,
  Server, CloudUpload, CalendarClock, Bell, ClipboardList,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { notificationsApi } from '../services/api';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/backups', label: 'Sauvegardes', icon: HardDrive },
  { to: '/remote-backup', label: 'Sauvegarde distante', icon: CloudUpload },
  { to: '/ssh-servers', label: 'Serveurs SSH', icon: Server },
  { to: '/schedules', label: 'Planifications', icon: CalendarClock },
  { to: '/verify', label: 'Vérifier', icon: CheckCircle },
  { to: '/audit', label: 'Audit', icon: ClipboardList },
];

const roleBadge = {
  admin:       'bg-red-500/20 text-red-300',
  responsable: 'bg-blue-500/20 text-blue-300',
  auditeur:    'bg-green-500/20 text-green-300',
};

function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  async function load() {
    try {
      const { data } = await notificationsApi.list();
      setUnread(data.unreadCount);
      setNotifications(data.notifications.slice(0, 8));
    } catch (_) {}
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function markAll() {
    await notificationsApi.markAllRead();
    load();
  }

  const typeColor = {
    backup_success: 'text-green-600',
    schedule_success: 'text-green-600',
    integrity_failure: 'text-red-600',
    schedule_error: 'text-red-600',
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        className="relative p-1.5 text-slate-400 hover:text-white transition-colors"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">Notifications</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAll} className="text-xs text-indigo-500 hover:underline">
                  Tout lire
                </button>
              )}
              <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">
                Voir tout
              </Link>
            </div>
          </div>
          {notifications.length === 0 ? (
            <p className="text-slate-400 text-xs text-center py-6">Aucune notification</p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id} className={clsx('px-4 py-2.5 border-b border-slate-50 last:border-0', !n.read && 'bg-indigo-50/50')}>
                  <p className={clsx('text-xs font-semibold', typeColor[n.type] || 'text-slate-700')}>{n.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-slate-300 mt-0.5">{new Date(n.createdAt).toLocaleString('fr-FR')}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Shield className="text-indigo-400" size={22} />
            <span className="font-bold text-lg tracking-tight">SecureBackup</span>
          </div>
          <p className="text-slate-400 text-xs mt-1">Chain Edition</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800',
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {user && (
          <div className="p-4 border-t border-slate-700">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-300 truncate max-w-[120px]">{user.email}</p>
              <div className="flex items-center gap-1">
                <NotificationBell />
                <button
                  onClick={logout}
                  className="text-slate-400 hover:text-white transition-colors"
                  title="Se déconnecter"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
            <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', roleBadge[user.role])}>
              {user.role}
            </span>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
