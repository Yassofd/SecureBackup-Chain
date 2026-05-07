import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { backupsApi } from '../services/api';

export default function UploadZone({ onSuccess }) {
  const [progress, setProgress] = useState(null);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');

  const onDrop = useCallback(async (files) => {
    if (!files.length) return;
    const formData = new FormData();
    formData.append('file', files[0]);

    setStatus('uploading');
    setProgress(0);
    setMessage('');

    try {
      const { data } = await backupsApi.upload(formData, (e) => {
        if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
      });
      setStatus('success');
      setMessage(`ID : ${data.backupId.slice(0, 8)}…`);
      setTimeout(() => { setStatus(null); setProgress(null); }, 4000);
      onSuccess?.();
    } catch (err) {
      setStatus('error');
      setMessage(err.response?.data?.error || "Échec de l'upload");
    }
  }, [onSuccess]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: status === 'uploading',
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50',
          status === 'uploading' && 'pointer-events-none opacity-60',
        )}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto text-gray-400 mb-3" size={32} />
        <p className="text-gray-600 font-medium text-sm">
          {isDragActive ? 'Relâchez ici…' : 'Glissez un fichier ou cliquez'}
        </p>
        <p className="text-gray-400 text-xs mt-1">Tout type, taille illimitée</p>
      </div>

      {status === 'uploading' && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Upload en cours…</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="flex items-center gap-2 text-green-600 text-sm">
          <CheckCircle size={15} />
          Sauvegardé — {message}
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle size={15} />
          {message}
        </div>
      )}
    </div>
  );
}
