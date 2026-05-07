import { useState, useEffect } from 'react';
import { ClipboardList, Download, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { auditApi } from '../services/api';

const ACTION_LABELS = {
  BACKUP_REGISTERED: 'Sauvegarde créée',
  BACKUP_READ:       'Sauvegarde consultée',
  INTEGRITY_VERIFIED:'Intégrité vérifiée',
};

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function Audit() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  const [filters, setFilters] = useState({ action: '', actor: '', dateFrom: '', dateTo: '' });
  const [applied, setApplied] = useState({});

  async function load(p = page, f = applied) {
    setLoading(true);
    try {
      const params = { page: p, limit: LIMIT };
      if (f.action)   params.action   = f.action;
      if (f.actor)    params.actor    = f.actor;
      if (f.dateFrom) params.dateFrom = f.dateFrom;
      if (f.dateTo)   params.dateTo   = f.dateTo;
      const { data } = await auditApi.list(params);
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1, {}); }, []);

  function applyFilters(e) {
    e.preventDefault();
    setApplied({ ...filters });
    setPage(1);
    load(1, { ...filters });
  }

  function goPage(p) {
    setPage(p);
    load(p, applied);
  }

  async function doExport(format) {
    setExporting(format);
    try {
      const params = {};
      if (applied.action)   params.action   = applied.action;
      if (applied.actor)    params.actor    = applied.actor;
      if (applied.dateFrom) params.dateFrom = applied.dateFrom;
      if (applied.dateTo)   params.dateTo   = applied.dateTo;
      const { data } = format === 'pdf'
        ? await auditApi.exportPdf(params)
        : await auditApi.exportCsv(params);
      saveBlob(data, `audit_${Date.now()}.${format}`);
    } catch (err) {
      alert('Export échoué : ' + err.message);
    } finally {
      setExporting('');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Audit Trail</h1>
          <p className="text-slate-500 text-sm mt-1">Toutes les opérations enregistrées sur le ledger Fabric</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => doExport('csv')} disabled={!!exporting}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
            {exporting === 'csv' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} CSV
          </button>
          <button onClick={() => doExport('pdf')} disabled={!!exporting}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
          </button>
        </div>
      </div>

      {/* Filtres */}
      <form onSubmit={applyFilters} className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-slate-400 text-xs mb-1">Action</label>
            <select value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700">
              <option value="">Toutes</option>
              <option value="BACKUP_REGISTERED">Sauvegarde créée</option>
              <option value="BACKUP_READ">Sauvegarde consultée</option>
              <option value="INTEGRITY_VERIFIED">Intégrité vérifiée</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Acteur (partiel)</label>
            <input value={filters.actor} onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
              placeholder="Admin@org1…" />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Date début</label>
            <input type="datetime-local" value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Date fin</label>
            <input type="datetime-local" value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button type="submit"
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm rounded-lg transition-colors">
            <Search size={14} /> Filtrer
          </button>
        </div>
      </form>

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
            <p>Aucune entrée d'audit</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Horodatage</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Cible</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Acteur</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">TxID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                    {e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                      {ACTION_LABELS[e.action] || e.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 max-w-[160px] truncate" title={e.target}>
                    {e.target}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate" title={e.actor}>
                    {e.actor ? e.actor.split('::')[0].replace('x509:/', '').split('/').pop() : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400" title={e.txId}>
                    {e.txId ? e.txId.slice(0, 12) + '…' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-400">{total} entrée{total !== 1 ? 's' : ''}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => goPage(page - 1)} disabled={page <= 1}
                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-slate-600">{page} / {totalPages}</span>
              <button onClick={() => goPage(page + 1)} disabled={page >= totalPages}
                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
