import { useState, useEffect } from 'react';
import { Search, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import BackupRow from '../components/BackupRow';
import { backupsApi } from '../services/api';

export default function Backups() {
  const [backups, setBackups] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    backupsApi.list()
      .then(({ data }) => setBackups(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = [...backups]
    .reverse()
    .filter((b) => b.fileName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sauvegardes</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un fichier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <Link
            to="/"
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Upload size={14} />
            Uploader
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="p-10 text-center text-gray-400">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-gray-400">
            {search ? `Aucun fichier correspondant à "${search}"` : 'Aucune sauvegarde pour l\'instant.'}
          </p>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-3 px-4">Fichier</th>
                <th className="py-3 px-4">Taille</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <BackupRow key={b.backupId} backup={b} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && (
        <p className="text-xs text-gray-400 mt-3 text-right">{filtered.length} sauvegarde(s)</p>
      )}
    </div>
  );
}
