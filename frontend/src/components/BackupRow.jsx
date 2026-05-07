import { Link } from 'react-router-dom';
import { FileText, Download } from 'lucide-react';
import { backupsApi } from '../services/api';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
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
    a.href = url;
    a.download = backup.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-gray-400 shrink-0" />
          <Link
            to={`/backups/${backup.backupId}`}
            className="text-indigo-600 hover:underline font-medium text-sm truncate max-w-xs"
          >
            {backup.fileName}
          </Link>
        </div>
      </td>
      <td className="py-3 px-4 text-sm text-gray-600 whitespace-nowrap">{formatSize(backup.fileSize)}</td>
      <td className="py-3 px-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(backup.timestamp)}</td>
      <td className="py-3 px-4">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          {backup.status}
        </span>
      </td>
      <td className="py-3 px-4">
        <button
          onClick={handleDownload}
          className="text-gray-400 hover:text-indigo-600 transition-colors"
          title="Télécharger"
        >
          <Download size={16} />
        </button>
      </td>
    </tr>
  );
}
