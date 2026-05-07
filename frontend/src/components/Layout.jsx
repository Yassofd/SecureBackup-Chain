import { NavLink, Outlet } from 'react-router-dom';
import { Shield, HardDrive, CheckCircle, LayoutDashboard, LogOut, Server, CloudUpload, CalendarClock } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/backups', label: 'Sauvegardes', icon: HardDrive },
  { to: '/remote-backup', label: 'Sauvegarde distante', icon: CloudUpload },
  { to: '/ssh-servers', label: 'Serveurs SSH', icon: Server },
  { to: '/schedules', label: 'Planifications', icon: CalendarClock },
  { to: '/verify', label: 'Vérifier', icon: CheckCircle },
];

const roleBadge = {
  admin:       'bg-red-500/20 text-red-300',
  responsable: 'bg-blue-500/20 text-blue-300',
  auditeur:    'bg-green-500/20 text-green-300',
};

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
              <p className="text-xs text-slate-300 truncate max-w-[140px]">{user.email}</p>
              <button
                onClick={logout}
                className="text-slate-400 hover:text-white transition-colors ml-2"
                title="Se déconnecter"
              >
                <LogOut size={15} />
              </button>
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
