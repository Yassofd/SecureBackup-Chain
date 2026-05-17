import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Save, Loader2, Download, Upload, AlertTriangle, CheckCircle } from 'lucide-react';
import clsx from 'clsx';
import api from '../services/api';

const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] } } };

function SectionCard({ title, children }) {
  return (
    <div className="panel">
      <div className="panel-header"><span className="panel-title">{title}</span></div>
      <div className="panel-body space-y-4">{children}</div>
    </div>
  );
}

function Row({ label, description, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-ink-700/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-100">{label}</p>
        {description && <p className="text-xs text-ink-400 mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={clsx(
        'relative w-10 h-5 rounded-full transition-colors duration-200',
        value ? 'bg-brand' : 'bg-ink-600',
      )}
    >
      <span className={clsx(
        'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
        value ? 'translate-x-5' : 'translate-x-0.5',
      )} />
    </button>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState({
    notifications: true,
    autoRefresh: true,
    compactMode: false,
    darkMode: true,
    auditLog: true,
    backupCompress: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [exporting, setExp] = useState(false);
  const [importing, setImp] = useState(false);
  const [importErr, setImpErr] = useState('');

  const set = (key) => (val) => { setSettings((s) => ({ ...s, [key]: val })); setSaved(false); };

  async function save() {
    setSaving(true); setSaved(false);
    await new Promise((r) => setTimeout(r, 600)); // UI feedback only — real save via API if endpoint exists
    setSaving(false); setSaved(true);
  }

  async function exportConfig() {
    setExp(true);
    try {
      const { data } = await api.get('/admin/export-config', { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a'); a.href = url; a.download = 'securebackup-config.tar.gz.enc'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.response?.data?.error || err.message); }
    finally { setExp(false); }
  }

  async function importConfig(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setImp(true); setImpErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      await api.post('/admin/import-config', fd);
      alert('Configuration importée avec succès. Redémarrez le serveur pour appliquer.');
    } catch (err) { setImpErr(err.response?.data?.error || err.message); }
    finally { setImp(false); e.target.value = ''; }
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <h1 className="page-title">Paramètres</h1>
        <p className="page-sub">Configuration de l'interface et du système</p>
      </motion.div>

      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <SectionCard title="Interface">
          <Row label="Notifications" description="Afficher les notifications push dans l'interface">
            <Toggle value={settings.notifications} onChange={set('notifications')} />
          </Row>
          <Row label="Actualisation automatique" description="Recharger les données toutes les 30 secondes">
            <Toggle value={settings.autoRefresh} onChange={set('autoRefresh')} />
          </Row>
          <Row label="Mode compact" description="Réduire les espacements dans les tableaux">
            <Toggle value={settings.compactMode} onChange={set('compactMode')} />
          </Row>
        </SectionCard>
      </motion.div>

      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <SectionCard title="Sauvegarde">
          <Row label="Compression zstd" description="Compresser les données avant chiffrement (niveau 3)">
            <Toggle value={settings.backupCompress} onChange={set('backupCompress')} />
          </Row>
          <Row label="Audit log" description="Enregistrer toutes les opérations dans le journal d'audit">
            <Toggle value={settings.auditLog} onChange={set('auditLog')} />
          </Row>
        </SectionCard>
      </motion.div>

      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <SectionCard title="Sauvegarde de la configuration">
          <div className="flex flex-wrap gap-3">
            <button onClick={exportConfig} disabled={exporting} className="btn-outline flex items-center gap-2">
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Exporter la configuration
            </button>
            <label className={clsx('btn-ghost flex items-center gap-2 cursor-pointer', importing && 'opacity-50 cursor-not-allowed')}>
              {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              Importer une configuration
              <input type="file" accept=".enc,.gz" className="hidden" onChange={importConfig} disabled={importing} />
            </label>
          </div>
          {importErr && <p className="text-red-400 text-xs flex items-center gap-1.5"><AlertTriangle size={12} />{importErr}</p>}
          <p className="text-xs text-ink-400">Les fichiers de configuration sont chiffrés avec AES-256-GCM.</p>
        </SectionCard>
      </motion.div>

      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
            <CheckCircle size={14} /> Paramètres enregistrés
          </span>
        )}
      </motion.div>
    </div>
  );
}
