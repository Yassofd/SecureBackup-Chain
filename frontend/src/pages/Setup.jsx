import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Building2, Server, User, CheckCircle, Download,
  ChevronRight, ChevronLeft, Wifi, WifiOff, Terminal, RefreshCw, Play,
} from 'lucide-react';
import axios from 'axios';
import clsx from 'clsx';

const api = axios.create({ baseURL: '/api' });

// ── Utilitaires ───────────────────────────────────────────────────────────────
function passwordStrength(pwd) {
  return {
    length:  pwd.length >= 8,
    upper:   /[A-Z]/.test(pwd),
    number:  /[0-9]/.test(pwd),
    special: /[^A-Za-z0-9]/.test(pwd),
  };
}
function isStrongPassword(pwd) {
  const s = passwordStrength(pwd);
  return s.length && s.upper && s.number && s.special;
}

// ── Composants ────────────────────────────────────────────────────────────────
function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

function Input({ className, ...props }) {
  return (
    <input
      className={clsx(
        'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300',
        className,
      )}
      {...props}
    />
  );
}

function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={clsx(
            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
            i < current  ? 'bg-indigo-600 text-white'
            : i === current ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600'
            : 'bg-gray-100 text-gray-400',
          )}>
            {i < current ? <CheckCircle size={16} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={clsx('h-0.5 w-8', i < current ? 'bg-indigo-600' : 'bg-gray-200')} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Étape 1 : Organisation ────────────────────────────────────────────────────
function Step1({ data, setData, onNext }) {
  const [errors, setErrors] = useState({});
  const validate = () => {
    const e = {};
    if (!data.name.trim()) e.name = 'Le nom est requis';
    if (!data.email.trim() || !/\S+@\S+\.\S+/.test(data.email)) e.email = 'Email valide requis';
    setErrors(e);
    return !Object.keys(e).length;
  };
  const sectors  = ['Santé', 'Finance', 'Éducation', 'Administration', 'Industrie', 'Commerce', 'Technologie', 'Autre'];
  const statuts  = ['SA', 'SAS', 'SARL', 'EURL', 'SCI', 'Association', 'Administration publique', 'Autre'];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nom de l'organisation *" error={errors.name}>
          <Input value={data.name} onChange={e => setData({ ...data, name: e.target.value })} placeholder="Mon Organisation" />
        </Field>
        <Field label="Statut juridique">
          <select value={data.legalStatus} onChange={e => setData({ ...data, legalStatus: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
            {statuts.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Adresse">
        <Input value={data.address} onChange={e => setData({ ...data, address: e.target.value })} placeholder="123 rue de la Paix" />
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Code postal">
          <Input value={data.postalCode} onChange={e => setData({ ...data, postalCode: e.target.value })} placeholder="75001" />
        </Field>
        <Field label="Ville">
          <Input value={data.city} onChange={e => setData({ ...data, city: e.target.value })} placeholder="Paris" />
        </Field>
        <Field label="Pays">
          <Input value={data.country} onChange={e => setData({ ...data, country: e.target.value })} placeholder="France" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Téléphone">
          <Input value={data.phone} onChange={e => setData({ ...data, phone: e.target.value })} placeholder="+33 1 23 45 67 89" />
        </Field>
        <Field label="Email de contact *" error={errors.email}>
          <Input type="email" value={data.email} onChange={e => setData({ ...data, email: e.target.value })} placeholder="contact@org.fr" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Secteur d'activité">
          <select value={data.sector} onChange={e => setData({ ...data, sector: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
            {sectors.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Identifiant fiscal (optionnel)">
          <Input value={data.taxId} onChange={e => setData({ ...data, taxId: e.target.value })} placeholder="FR12345678901" />
        </Field>
      </div>
      <div className="flex justify-end pt-2">
        <button onClick={() => validate() && onNext()}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          Suivant <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Étape 2 : Serveur ─────────────────────────────────────────────────────────
function Step2({ data, setData, onNext, onBack }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!data.host.trim()) e.host = 'IP ou DNS requis';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const testServer = async () => {
    if (!data.host.trim()) return;
    setTesting(true); setTestResult(null);
    try {
      const { data: r } = await api.post('/setup/test-server', { host: data.host, port: data.apiPort });
      setTestResult(r.reachable);
    } catch { setTestResult(false); }
    setTesting(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-800">
        Cette machine sera le <strong>Nœud 1 (Org1)</strong>. Les autres nœuds seront ajoutés depuis le dashboard via SSH.
      </div>
      <Field label="IP publique ou DNS de cette machine *" error={errors.host}>
        <div className="flex gap-2">
          <Input value={data.host} onChange={e => setData({ ...data, host: e.target.value })} placeholder="192.168.1.1 ou mon-serveur.fr" />
          <button onClick={testServer} disabled={testing}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm whitespace-nowrap hover:bg-gray-50 disabled:opacity-50">
            {testing ? 'Test…' : testResult === true ? <><Wifi size={14} className="text-green-500" /> OK</> : testResult === false ? <><WifiOff size={14} className="text-red-500" /> Échec</> : 'Tester'}
          </button>
        </div>
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Port Orderer (Fabric)">
          <Input type="number" value={data.fabricPort} onChange={e => setData({ ...data, fabricPort: e.target.value })} />
        </Field>
        <Field label="Port IPFS API">
          <Input type="number" value={data.ipfsPort} onChange={e => setData({ ...data, ipfsPort: e.target.value })} />
        </Field>
        <Field label="Port API Backend">
          <Input type="number" value={data.apiPort} onChange={e => setData({ ...data, apiPort: e.target.value })} />
        </Field>
      </div>
      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ChevronLeft size={16} /> Retour
        </button>
        <button onClick={() => validate() && onNext()}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          Suivant <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Étape 3 : Admin ───────────────────────────────────────────────────────────
function Step3({ data, setData, onNext, onBack }) {
  const [errors, setErrors] = useState({});
  const s = passwordStrength(data.password);
  const validate = () => {
    const e = {};
    if (!data.email || !/\S+@\S+\.\S+/.test(data.email)) e.email = 'Email valide requis';
    if (!isStrongPassword(data.password)) e.password = 'Mot de passe trop faible';
    if (data.password !== data.confirm) e.confirm = 'Les mots de passe ne correspondent pas';
    setErrors(e);
    return !Object.keys(e).length;
  };
  const rules = [
    { key: 'length', label: '8 caractères minimum' },
    { key: 'upper',  label: 'Une majuscule' },
    { key: 'number', label: 'Un chiffre' },
    { key: 'special', label: 'Un caractère spécial' },
  ];
  return (
    <div className="space-y-4">
      <Field label="Email administrateur *" error={errors.email}>
        <Input type="email" value={data.email} onChange={e => setData({ ...data, email: e.target.value })} placeholder="admin@organisation.fr" />
      </Field>
      <Field label="Mot de passe *" error={errors.password}>
        <Input type="password" value={data.password} onChange={e => setData({ ...data, password: e.target.value })} />
        {data.password && (
          <div className="mt-2 grid grid-cols-2 gap-1">
            {rules.map(r => (
              <div key={r.key} className={clsx('flex items-center gap-1.5 text-xs', s[r.key] ? 'text-green-600' : 'text-gray-400')}>
                <div className={clsx('w-1.5 h-1.5 rounded-full', s[r.key] ? 'bg-green-500' : 'bg-gray-300')} />
                {r.label}
              </div>
            ))}
          </div>
        )}
      </Field>
      <Field label="Confirmer le mot de passe *" error={errors.confirm}>
        <Input type="password" value={data.confirm} onChange={e => setData({ ...data, confirm: e.target.value })} />
      </Field>
      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ChevronLeft size={16} /> Retour
        </button>
        <button onClick={() => validate() && onNext()}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          Suivant <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Étape 4 : Validation + Initialisation ────────────────────────────────────
function Step4({ org, server, admin, onBack, onNext }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const initialize = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/setup/initialize', {
        organization: org, server,
        admin: { email: admin.email, password: admin.password },
      });
      // Télécharger le kit de récupération
      const blob = new Blob([JSON.stringify(data.recoveryKit, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `securebackup-recovery-kit-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onNext();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de l\'initialisation');
    }
    setLoading(false);
  };

  const Row = ({ label, value }) => value ? (
    <div className="flex py-2 border-b border-gray-100 last:border-0 text-sm">
      <span className="w-44 text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  ) : null;

  return (
    <div className="space-y-5">
      <div className="bg-gray-50 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Organisation</p>
        <Row label="Nom" value={org.name} />
        <Row label="Secteur" value={org.sector} />
        <Row label="Email" value={org.email} />
      </div>
      <div className="bg-gray-50 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Nœud 1 (Org1)</p>
        <Row label="Hôte" value={server.host} />
        <Row label="Port Orderer" value={server.fabricPort} />
        <Row label="Port API" value={server.apiPort} />
      </div>
      <div className="bg-gray-50 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Administrateur</p>
        <Row label="Email" value={admin.email} />
        <Row label="Mot de passe" value="••••••••" />
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
        Le kit de récupération sera téléchargé automatiquement. Conservez-le en lieu sûr.
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex justify-between pt-1">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ChevronLeft size={16} /> Retour
        </button>
        <button onClick={initialize} disabled={loading}
          className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
          <Download size={15} />
          {loading ? 'Initialisation…' : 'Initialiser et continuer'}
        </button>
      </div>
    </div>
  );
}

// ── Étape 5 : Démarrage du réseau Fabric ─────────────────────────────────────
function Step5({ serverHost }) {
  const navigate = useNavigate();
  const [phase,   setPhase]  = useState('idle');  // idle | running | done | error
  const [logs,    setLogs]   = useState([]);
  const [current, setCurrent] = useState('');
  const [progress, setProgress] = useState(0);
  const logsRef = useRef(null);
  const esRef   = useRef(null);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  const STEP_LABELS = {
    start_containers:  'Démarrage Docker',
    wait_orderers:     'Attente Raft',
    create_channel:    'Création du channel',
    join_peers:        'Jointure des peers',
    anchor_peers:      'Configuration anchors',
    deploy_chaincode:  'Déploiement chaincode',
    network:           'Réseau opérationnel',
  };

  const startNetwork = () => {
    if (esRef.current) esRef.current.close();
    setLogs([]);
    setPhase('running');
    setProgress(0);

    const token = localStorage.getItem('accessToken');
    // On utilise un fetch + ReadableStream pour le SSE authentifié
    fetch('/api/deployment/init-network/stream', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((resp) => {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      const read = () => reader.read().then(({ done, value }) => {
        if (done) return;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.log) setLogs(l => [...l, { type: evt.type, text: evt.log }]);
            if (evt.type === 'STEP') { setCurrent(STEP_LABELS[evt.step] || evt.step); setProgress(p => Math.min(p + 15, 90)); }
            if (evt.type === 'OK')   setProgress(p => Math.min(p + 5, 95));
            if (evt.done && evt.type === 'DONE') { setPhase('done'); setProgress(100); }
            if (evt.done && evt.error) setPhase('error');
          } catch (_) {}
        }
        read();
      }).catch(() => setPhase('error'));

      read();
    }).catch(() => setPhase('error'));
  };

  return (
    <div className="space-y-5">
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm text-indigo-800">
        <p className="font-semibold mb-1">Démarrage du réseau Hyperledger Fabric</p>
        <p>Cette étape va démarrer les 3 nœuds localement, créer le channel <strong>backupchannel</strong> et déployer le chaincode.</p>
        <p className="mt-1 text-xs text-indigo-600">Durée estimée : 2-5 minutes selon la vitesse réseau Docker.</p>
      </div>

      {/* Barre de progression */}
      {phase !== 'idle' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{current || 'Initialisation…'}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-500', phase === 'error' ? 'bg-red-500' : 'bg-indigo-600')}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Terminal de logs */}
      {logs.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Terminal size={12} className="text-slate-400" />
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Logs réseau</span>
            {phase === 'running' && <RefreshCw size={11} className="text-amber-400 animate-spin ml-auto" />}
          </div>
          <div ref={logsRef} className="max-h-52 overflow-y-auto space-y-0.5 font-mono text-xs">
            {logs.map((l, i) => (
              <div key={i} className={clsx(
                l.type === 'OK' || l.type === 'DONE' ? 'text-green-400'
                : l.type === 'ERROR' ? 'text-red-400'
                : l.type === 'STEP' ? 'text-amber-300 font-bold'
                : 'text-slate-300',
              )}>
                {l.text}
              </div>
            ))}
            {phase === 'running' && <div className="text-slate-500 animate-pulse">…</div>}
          </div>
        </div>
      )}

      {/* Messages de résultat */}
      {phase === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
          <p className="font-semibold mb-1">Réseau opérationnel</p>
          <p>Les 3 nœuds sont démarrés, le channel est créé, le chaincode est déployé.</p>
          <p className="mt-1">Vous pouvez maintenant vous connecter au dashboard. Depuis la page <strong>Déploiement</strong>, ajoutez les nœuds 2 et 3 sur vos machines distantes via SSH.</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
          Une erreur est survenue. Si le réseau était déjà démarré, vous pouvez ignorer et continuer.
        </div>
      )}

      <div className="flex justify-between pt-2">
        {phase === 'idle' && (
          <button onClick={startNetwork}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 w-full justify-center">
            <Play size={15} /> Démarrer le réseau Fabric
          </button>
        )}
        {phase === 'running' && (
          <button disabled
            className="flex items-center gap-2 px-6 py-2.5 bg-gray-300 text-gray-600 rounded-lg text-sm font-semibold w-full justify-center cursor-not-allowed">
            <RefreshCw size={15} className="animate-spin" /> Démarrage en cours…
          </button>
        )}
        {(phase === 'done' || phase === 'error') && (
          <div className="flex gap-3 w-full">
            {phase === 'error' && (
              <button onClick={startNetwork}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
                <RefreshCw size={14} /> Relancer
              </button>
            )}
            <button onClick={() => navigate('/login', { replace: true })}
              className="flex-1 flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 justify-center">
              <CheckCircle size={15} /> Accéder au dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Wizard principal ──────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Organisation', icon: Building2 },
  { label: 'Serveur',      icon: Server    },
  { label: 'Admin',        icon: User      },
  { label: 'Validation',   icon: CheckCircle },
  { label: 'Réseau',       icon: Shield    },
];

export default function Setup() {
  const [step, setStep] = useState(0);
  const [org,    setOrg]    = useState({ name: '', legalStatus: 'SA', address: '', postalCode: '', city: '', country: 'France', phone: '', email: '', sector: 'Technologie', taxId: '' });
  const [server, setServer] = useState({ host: '', fabricPort: '7050', ipfsPort: '5001', apiPort: '3000' });
  const [admin,  setAdmin]  = useState({ email: '', password: '', confirm: '' });

  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => s - 1);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-4">
            <Shield className="text-white" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white">Configuration initiale</h1>
          <p className="text-slate-400 text-sm mt-1">SecureBackup-Chain — {STEPS[step].label}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <StepIndicator current={step} total={STEPS.length} />

          {step === 0 && <Step1 data={org} setData={setOrg} onNext={next} />}
          {step === 1 && <Step2 data={server} setData={setServer} onNext={next} onBack={back} />}
          {step === 2 && <Step3 data={admin} setData={setAdmin} onNext={next} onBack={back} />}
          {step === 3 && <Step4 org={org} server={server} admin={admin} onBack={back} onNext={next} />}
          {step === 4 && <Step5 serverHost={server.host} />}
        </div>

        <p className="text-center text-slate-500 text-xs mt-4">
          Étape {step + 1} sur {STEPS.length}
        </p>
      </div>
    </div>
  );
}
