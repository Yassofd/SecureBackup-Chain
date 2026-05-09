import { Link } from 'react-router-dom';
import { FileText, Download } from 'lucide-react';
import { backupsApi } from '../services/api';

function formatSize(bytes) {
  if (bytes < 1024)    return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function BackupRow({ backup }) {
  const handleDownload = async (e) => {
    e.preventDefault();
    const { data } = await backupsApi.download(backup.backupId);
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url; a.download = backup.fileName; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <tr className="border-b border-ink-600 hover:bg-ink-600/40 transition-colors group">
      <td className="td">
        <div className="flex items-center gap-2">
          <FileText size={13} className="text-ink-400 shrink-0" />
          <Link
            to={`/backups/${backup.backupId}`}
            className="text-brand hover:text-brand-300 font-medium text-sm truncate max-w-xs transition-colors"
          >
            {backup.fileName}
          </Link>
        </div>
      </td>
      <td className="td text-ink-300 whitespace-nowrap font-mono text-xs">{formatSize(backup.fileSize)}</td>
      <td className="td text-ink-400 whitespace-nowrap font-mono text-xs">{formatDate(backup.timestamp)}</td>
      <td className="td">
        <span className="badge-green">{backup.status}</span>
      </td>
      <td className="td text-right pr-5">
        <button
          onClick={handleDownload}
          className="text-ink-500 hover:text-brand transition-colors opacity-0 group-hover:opacity-100"
          title="Télécharger"
        >
          <Download size={14} />
        </button>
      </td>
    </tr>
  );
}
