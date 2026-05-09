import { useState, useEffect } from 'react';
import { ClipboardList, Download, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { auditApi } from '../services/api';

const ACTION_LABELS = {
  BACKUP_REGISTERED: 'Sauvegarde créée',
  BACKUP_READ:       'Lecture',
  INTEGRITY_VERIFIED:'Intégrité vérifiée',
  restore_remote:    'Restauration distante',
};
const ACTION_COLOR = {
  BACKUP_REGISTERED: 'badge-green',
  BACKUP_READ:       'badge-blue',
  INTEGRITY_VERIFIED:'badge-purple',
  restore_remote:    'badge-amber',
};

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function Audit() {
  const [entries, setEntries]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [exporting, setExp]     = useState('');
  const [page, setPage]         = useState(1);
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
    } catch (_) {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(1, {}); }, []);

  function applyFilters(e) {
    e.preventDefault();
    setApplied({ ...filters }); setPage(1); load(1, { ...filters });
  }

  function goPage(p) { setPage(p); load(p, applied); }

  async function doExport(format) {
    setExp(format);
    try {
      const params = {};
      if (applied.action)   params.action   = applied.action;
      if (applied.actor)    params.actor    = applied.actor;
      if (applied.dateFrom) params.dateFrom = applied.dateFrom;
      if (applied.dateTo)   params.dateTo   = applied.dateTo;
      const { data } = format === 'pdf' ? await auditApi.exportPdf(params) : await auditApi.exportCsv(params);
      saveBlob(data, `audit_${Date.now()}.${format}`);
    } catch (err) { alert('Export échoué : ' + err.message); }
    finally { setExp(''); }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="p-7">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Trail</h1>
          <p className="page-sub">Opérations enregistrées sur le ledger Hyperledger Fabric</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => doExport('csv')} disabled={!!exporting} className="btn-outline flex items-center gap-1.5">
            {exporting === 'csv' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} CSV
          </button>
          <button onClick={() => doExport('pdf')} disabled={!!exporting} className="btn-primary flex items-center gap-1.5">
            {exporting === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <form onSubmit={applyFilters} className="panel mb-4">
        <div className="panel-header">
          <span className="panel-title">Filtres</span>
        </div>
        <div className="panel-body">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Action</label>
            <select value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))} className="input">
              <option value="">Toutes</option>
              <option value="BACKUP_REGISTERED">Sauvegarde créée</option>
              <option value="BACKUP_READ">Lecture</option>
              <option value="INTEGRITY_VERIFIED">Intégrité vérifiée</option>
              <option value="restore_remote">Restauration distante</option>
            </select>
          </div>
          <div>
            <label className="label">Acteur</label>
            <input value={filters.actor} onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))} className="input" placeholder="Admin@org1…" />
          </div>
          <div>
            <label className="label">Date début</label>
            <input type="datetime-local" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Date fin</label>
            <input type="datetime-local" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} className="input" />
          </div>
        </div>
          <div className="flex justify-end mt-3">
            <button type="submit" className="btn-primary">
              <Search size={13} /> Filtrer
            </button>
          </div>
        </div>
      </form>

      {/* Table */}
      <div className="panel overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-brand" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList size={36} className="mx-auto mb-3 text-ink-400" />
            <p className="text-ink-300 text-sm">Aucune entrée d'audit</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-500">
                <th className="th">Horodatage</th>
                <th className="th">Action</th>
                <th className="th">Cible</th>
                <th className="th">Acteur</th>
                <th className="th">TxID</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-b border-ink-600 hover:bg-ink-650 transition-colors">
                  <td className="td text-ink-200 whitespace-nowrap font-mono text-xs">
                    {e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR') : '—'}
                  </td>
                  <td className="td">
                    <span className={ACTION_COLOR[e.action] || 'badge-blue'}>
                      {ACTION_LABELS[e.action] || e.action}
                    </span>
                  </td>
                  <td className="td font-mono text-xs text-ink-200 max-w-[160px] truncate" title={e.target}>{e.target}</td>
                  <td className="td text-xs text-ink-300 max-w-[180px] truncate" title={e.actor}>
                    {e.actor ? e.actor.split('::')[0].replace('x509:/', '').split('/').pop() : '—'}
                  </td>
                  <td className="td font-mono text-xs text-ink-400" title={e.txId}>
                    {e.txId ? e.txId.slice(0, 12) + '…' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-ink-600">
            <span className="text-xs text-ink-300 font-mono">{total} entrée(s)</span>
            <div className="flex items-center gap-2">
              <button onClick={() => goPage(page - 1)} disabled={page <= 1} className="p-1.5 text-ink-300 hover:text-ink-50 disabled:opacity-30 transition-colors">
                <ChevronLeft size={15} />
              </button>
              <span className="text-sm text-ink-100 font-mono">{page} / {totalPages}</span>
              <button onClick={() => goPage(page + 1)} disabled={page >= totalPages} className="p-1.5 text-ink-300 hover:text-ink-50 disabled:opacity-30 transition-colors">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
