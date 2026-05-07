import { useState, useEffect } from 'react';
import { Bell, CheckCheck, Trash2, CheckCircle, XCircle, CalendarClock, Shield } from 'lucide-react';
import clsx from 'clsx';
import { notificationsApi } from '../services/api';

const TYPE_CONFIG = {
  backup_success:   { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
  schedule_success: { icon: CalendarClock, color: 'text-green-500', bg: 'bg-green-50' },
  integrity_failure:{ icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  schedule_error:   { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  default:          { icon: Bell, color: 'text-slate-400', bg: 'bg-slate-50' },
};

function typeConf(type) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.default;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await notificationsApi.list();
    setNotifications(data.notifications);
    setUnread(data.unreadCount);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function markRead(id) {
    await notificationsApi.markRead(id);
    setNotifications((ns) => ns.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnread((u) => Math.max(0, u - 1));
  }

  async function markAllRead() {
    await notificationsApi.markAllRead();
    setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }

  async function remove(id) {
    await notificationsApi.remove(id);
    const wasUnread = notifications.find((n) => n.id === id && !n.read);
    setNotifications((ns) => ns.filter((n) => n.id !== id));
    if (wasUnread) setUnread((u) => Math.max(0, u - 1));
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Notifications</h1>
          <p className="text-slate-500 text-sm mt-1">{unread} non lue{unread !== 1 ? 's' : ''}</p>
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
          >
            <CheckCheck size={15} /> Tout marquer lu
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Chargement…</p>
      ) : notifications.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Bell size={40} className="mx-auto mb-3 opacity-30" />
          <p>Aucune notification</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const { icon: Icon, color, bg } = typeConf(n.type);
            return (
              <div
                key={n.id}
                className={clsx(
                  'flex items-start gap-3 p-4 rounded-xl border transition-colors',
                  n.read ? 'bg-white border-slate-100' : 'bg-indigo-50/60 border-indigo-100',
                )}
              >
                <div className={clsx('p-2 rounded-lg shrink-0 mt-0.5', bg)}>
                  <Icon size={16} className={color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{n.message}</p>
                  <p className="text-xs text-slate-300 mt-1">{new Date(n.createdAt).toLocaleString('fr-FR')}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!n.read && (
                    <button onClick={() => markRead(n.id)} title="Marquer comme lu"
                      className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors">
                      <CheckCheck size={14} />
                    </button>
                  )}
                  <button onClick={() => remove(n.id)} title="Supprimer"
                    className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
