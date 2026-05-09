import { useState, useEffect } from 'react';
import { Bell, CheckCheck, Trash2, CheckCircle, XCircle, CalendarClock } from 'lucide-react';
import clsx from 'clsx';
import { notificationsApi } from '../services/api';

const TYPE_CONFIG = {
  backup_success:   { icon: CheckCircle,  cls: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  schedule_success: { icon: CalendarClock, cls: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  integrity_failure:{ icon: XCircle,      cls: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
  schedule_error:   { icon: XCircle,      cls: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
  default:          { icon: Bell,         cls: 'text-ink-300',     bg: 'bg-ink-600 border-ink-500' },
};

function typeConf(type) { return TYPE_CONFIG[type] || TYPE_CONFIG.default; }

export default function Notifications() {
  const [notifications, setNot] = useState([]);
  const [unread, setUnread]     = useState(0);
  const [loading, setLoading]   = useState(true);

  async function load() {
    const { data } = await notificationsApi.list();
    setNot(data.notifications); setUnread(data.unreadCount); setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function markRead(id) {
    await notificationsApi.markRead(id);
    setNot((ns) => ns.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnread((u) => Math.max(0, u - 1));
  }

  async function markAllRead() {
    await notificationsApi.markAllRead();
    setNot((ns) => ns.map((n) => ({ ...n, read: true }))); setUnread(0);
  }

  async function remove(id) {
    const wasUnread = notifications.find((n) => n.id === id && !n.read);
    await notificationsApi.remove(id);
    setNot((ns) => ns.filter((n) => n.id !== id));
    if (wasUnread) setUnread((u) => Math.max(0, u - 1));
  }

  return (
    <div className="p-7 max-w-2xl mx-auto">
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-sub">{unread} non lue{unread !== 1 ? 's' : ''}</p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="btn-primary flex items-center gap-1.5">
            <CheckCheck size={13} /> Tout marquer lu
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="w-6 h-6 border-2 border-ink-500 border-t-brand rounded-full animate-spin mx-auto" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-20 card">
          <Bell size={36} className="mx-auto mb-3 text-ink-400" />
          <p className="text-ink-300 text-sm">Aucune notification</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const { icon: Icon, cls, bg } = typeConf(n.type);
            return (
              <div key={n.id} className={clsx('flex items-start gap-3 p-4 rounded-xl border transition-colors', n.read ? 'bg-ink-700 border-ink-500' : 'bg-ink-650 border-brand/30')}>
                <div className={clsx('p-2 rounded-lg border shrink-0 mt-0.5', bg)}>
                  <Icon size={14} className={cls} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-50">{n.title}</p>
                  <p className="text-xs text-ink-200 mt-0.5">{n.message}</p>
                  <p className="text-[10px] text-ink-400 mt-1 font-mono">{new Date(n.createdAt).toLocaleString('fr-FR')}</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {!n.read && (
                    <button onClick={() => markRead(n.id)} title="Marquer lu" className="p-1.5 text-ink-300 hover:text-brand rounded-lg hover:bg-ink-600 transition-colors">
                      <CheckCheck size={13} />
                    </button>
                  )}
                  <button onClick={() => remove(n.id)} title="Supprimer" className="p-1.5 text-ink-300 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                    <Trash2 size={13} />
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
