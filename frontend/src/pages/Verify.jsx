import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Shield, Upload, CheckCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { backupsApi } from '../services/api';

export default function Verify() {
  const [backupId, setBackupId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({ multiple: false });
  const file = acceptedFiles[0];

  const handleVerify = async () => {
    if (!backupId.trim() || !file) {
      setError('Entrez un ID de sauvegarde et sélectionnez un fichier.');
      return;
    }
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await backupsApi.verify(backupId.trim(), formData);
      setResult(data.valid);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la vérification.');
    }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Vérifier l'intégrité</h1>
      <p className="text-gray-500 text-sm mb-8">
        Comparez un fichier local avec son empreinte enregistrée sur la blockchain.
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            ID de sauvegarde
          </label>
          <input
            type="text"
            value={backupId}
            onChange={(e) => setBackupId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Fichier à vérifier
          </label>
          <div
            {...getRootProps()}
            className={clsx(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              isDragActive
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50',
            )}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto text-gray-400 mb-2" size={26} />
            {file ? (
              <p className="text-sm text-indigo-600 font-medium">{file.name}</p>
            ) : (
              <p className="text-sm text-gray-500">Glissez un fichier ou cliquez</p>
            )}
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          onClick={handleVerify}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Shield size={15} />
          {loading ? 'Vérification…' : 'Vérifier'}
        </button>

        {result === true && (
          <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle className="text-green-500 mt-0.5 shrink-0" size={22} />
            <div>
              <p className="font-semibold text-green-800">Fichier intègre</p>
              <p className="text-green-600 text-sm mt-0.5">
                Le hash SHA-256 correspond à l'enregistrement sur la blockchain.
              </p>
            </div>
          </div>
        )}

        {result === false && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <XCircle className="text-red-500 mt-0.5 shrink-0" size={22} />
            <div>
              <p className="font-semibold text-red-800">Fichier altéré</p>
              <p className="text-red-600 text-sm mt-0.5">
                Le hash SHA-256 ne correspond pas à l'enregistrement sur la blockchain.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
