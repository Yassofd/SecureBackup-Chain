import { useState, useEffect } from 'react';
import { Search, Upload, HardDrive } from 'lucide-react';
import { Link } from 'react-router-dom';
import BackupRow from '../components/BackupRow';
import { backupsApi } from '../services/api';

export default function Backups() {
  const [backups, setBackups] = useState([]);
  const [search,  setSearch]  = useState('');
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
    <div className="p-7">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Sauvegardes</h1>
          <p className="page-sub">Fichiers sauvegardés sur IPFS Cluster</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-8 w-56"
            />
          </div>
          <Link to="/" className="btn-primary">
            <Upload size={13} /> Uploader
          </Link>
        </div>
      </div>

      {/* Table panel */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Fichiers</span>
          <span className="text-xs text-ink-300 font-mono">{filtered.length} résultat(s)</span>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="w-5 h-5 border-2 border-ink-500 border-t-brand rounded-full animate-spin mx-auto" />
            <p className="text-ink-300 text-xs mt-3">Chargement…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <HardDrive size={32} className="text-ink-500 mx-auto mb-3" />
            <p className="text-ink-300 text-sm">
              {search ? `Aucun fichier pour "${search}"` : 'Aucune sauvegarde pour l\'instant.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-500">
                  <th className="th">Fichier</th>
                  <th className="th">Taille</th>
                  <th className="th">Date</th>
                  <th className="th">Statut</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => <BackupRow key={b.backupId} backup={b} />)}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-ink-600 bg-ink-800/40">
            <span className="text-xs text-ink-400 font-mono">{filtered.length} fichier(s)</span>
          </div>
        )}
      </div>
    </div>
  );
}
