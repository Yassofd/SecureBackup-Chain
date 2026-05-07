import clsx from 'clsx';

const colors = {
  indigo: 'bg-indigo-50 text-indigo-600',
  green:  'bg-green-50 text-green-600',
  blue:   'bg-blue-50 text-blue-600',
  amber:  'bg-amber-50 text-amber-600',
};

export default function StatCard({ label, value, icon: Icon, color = 'indigo', sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={clsx('p-3 rounded-lg shrink-0', colors[color])}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500 truncate">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}
