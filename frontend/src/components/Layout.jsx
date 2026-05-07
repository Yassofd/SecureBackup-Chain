import { NavLink, Outlet } from 'react-router-dom';
import { Shield, HardDrive, CheckCircle, LayoutDashboard } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/backups', label: 'Sauvegardes', icon: HardDrive },
  { to: '/verify', label: 'Vérifier', icon: CheckCircle },
];

export default function Layout() {
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
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700 text-xs text-slate-500">
          MVP — Phase 5
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
