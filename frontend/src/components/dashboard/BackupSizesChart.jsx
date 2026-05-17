import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HardDrive } from 'lucide-react';
import { backupsApi } from '../../services/api';

function fmtShort(bytes) {
  if (!bytes) return '0';
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(0)} K`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} M`;
  return `${(bytes / 1073741824).toFixed(2)} G`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ink-800 border border-ink-600 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-ink-300 mb-1 font-mono truncate max-w-[160px]">{label}</p>
      <p className="text-brand font-semibold">{fmtShort(payload[0]?.value)} octets</p>
    </div>
  );
};

export default function BackupSizesChart() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    backupsApi.list()
      .then(({ data: backups }) => {
        const last8 = [...backups].reverse().slice(0, 8);
        setData(last8.map((b) => ({
          name: b.fileName?.split('.')[0]?.slice(0, 10) || b.backupId?.slice(0, 8) || '?',
          size: b.fileSize || 0,
        })).reverse());
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="panel h-full flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-ink-500 border-t-brand rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header">
        <span className="panel-title flex items-center gap-2"><HardDrive size={13} className="text-brand" /> Tailles des sauvegardes</span>
        <span className="text-xs text-ink-300 font-mono">8 dernières</span>
      </div>
      <div className="flex-1 p-4 min-h-0">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-ink-400 text-sm">Aucune donnée</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="rgba(48,48,88,0.5)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6565a0' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#6565a0' }} tickLine={false} axisLine={false} tickFormatter={fmtShort} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,180,216,0.06)' }} />
              <Bar dataKey="size" fill="#00b4d8" radius={[4, 4, 0, 0]} barSize={20}
                style={{ filter: 'drop-shadow(0 0 6px rgba(0,180,216,0.3))' }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
