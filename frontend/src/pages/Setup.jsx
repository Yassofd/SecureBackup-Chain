import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Building2, Server, User, CheckCircle, Download,
  ChevronRight, ChevronLeft, Wifi, WifiOff, Terminal, RefreshCw, Play, Loader2,
} from 'lucide-react';
import axios from 'axios';
import clsx from 'clsx';

const api = axios.create({ baseURL: '/api' });

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

function Field({ label, error, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={clsx(
            'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
            i < current  ? 'bg-brand text-white'
            : i === current ? 'bg-brand/20 text-brand ring-2 ring-brand/50'
            : 'bg-ink-600 text-ink-400',
          )}>
            {i < current ? <CheckCircle size={14} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={clsx('h-0.5 w-8 rounded-full', i < current ? 'bg-brand' : 'bg-ink-600')} />
          )}
        </div>
      ))}
    </div>
  );
}

function Step1({ data, setData, onNext }) {
  const [errors, setErrors] = useState({});
  const validate = () => {
    const e = {};
    if (!data.name.trim()) e.name = 'Le nom est requis';
    if (!data.email.trim() || !/\S+@\S+\.\S+/.test(data.email)) e.email = 'Email valide requis';
    setErrors(e);
    return !Object.keys(e).length;
  };
  const sectors = ['Santé', 'Finance', 'Éducation', 'Administration', 'Industrie', 'Commerce', 'Technologie', 'Autre'];
  const statuts  = ['SA', 'SAS', 'SARL', 'EURL', 'SCI', 'Association', 'Administration publique', 'Autre'];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nom de l'organisation *" error={errors.name}>
          <input value={data.name} onChange={e => setData({ ...data, name: e.target.value })} className="input" placeholder="Mon Organisation" />
        </Field>
        <Field label="Statut juridique">
          <select value={data.legalStatus} onChange={e => setData({ ...data, legalStatus: e.target.value })} className="input">
            {statuts.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Adresse">
        <input value={data.address} onChange={e => setData({ ...data, address: e.target.value })} className="input" placeholder="123 rue de la Paix" />
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Code postal">
          <input value={data.postalCode} onChange={e => setData({ ...data, postalCode: e.target.value })} className="input" placeholder="75001" />
        </Field>
        <Field label="Ville">
          <input value={data.city} onChange={e => setData({ ...data, city: e.target.value })} className="input" placeholder="Paris" />
        </Field>
        <Field label="Pays">
          <input value={data.country} onChange={e => setData({ ...data, country: e.target.value })} className="input" placeholder="France" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Téléphone">
          <input value={data.phone} onChange={e => setData({ ...data, phone: e.target.value })} className="input" placeholder="+33 1 23 45 67 89" />
        </Field>
        <Field label="Email de contact *" error={errors.email}>
          <input type="email" value={data.email} onChange={e => setData({ ...data, email: e.target.value })} className="input" placeholder="contact@org.fr" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Secteur d'activité">
          <select value={data.sector} onChange={e => setData({ ...data, sector: e.target.value })} className="input">
            {sectors.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Identifiant fiscal (optionnel)">
          <input value={data.taxId} onChange={e => setData({ ...data, taxId: e.target.value })} className="input" placeholder="FR12345678901" />
        </Field>
      </div>
      <div className="flex justify-end pt-2">
        <button onClick={() => validate() && onNext()} className="btn-primary flex items-center gap-2">
          Suivant <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

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
      <div className="bg-brand/10 border border-brand/20 rounded-xl p-3 text-xs text-brand/90">
        Cette machine sera le <strong className="text-brand">Nœud 1 (Org1)</strong>. Les autres nœuds seront ajoutés depuis le dashboard via SSH.
      </div>
      <Field label="IP publique ou DNS de cette machine *" error={errors.host}>
        <div className="flex gap-2">
          <input value={data.host} onChange={e => setData({ ...data, host: e.target.value })} className="input font-mono" placeholder="192.168.1.1 ou mon-serveur.fr" />
          <button onClick={testServer} disabled={testing}
            className="flex items-center gap-1.5 px-3 py-2 border border-ink-500 text-ink-300 hover:border-ink-400 hover:text-ink-100 bg-ink-600 rounded-lg text-sm whitespace-nowrap transition-colors disabled:opacity-50">
            {testing ? <Loader2 size={13} className="animate-spin" />
              : testResult === true  ? <><Wifi size={13} className="text-emerald-400" /> OK</>
              : testResult === false ? <><WifiOff size={13} className="text-red-400" /> Échec</>
              : 'Tester'}
          </button>
        </div>
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Port Orderer (Fabric)">
          <input type="number" value={data.fabricPort} onChange={e => setData({ ...data, fabricPort: e.target.value })} className="input" />
        </Field>
        <Field label="Port IPFS API">
          <input type="number" value={data.ipfsPort} onChange={e => setData({ ...data, ipfsPort: e.target.value })} className="input" />
        </Field>
        <Field label="Port API Backend">
          <input type="number" value={data.apiPort} onChange={e => setData({ ...data, apiPort: e.target.value })} className="input" />
        </Field>
      </div>
      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="flex items-center gap-1 btn-ghost text-sm">
          <ChevronLeft size={15} /> Retour
        </button>
        <button onClick={() => validate() && onNext()} className="btn-primary flex items-center gap-2">
          Suivant <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

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
    { key: 'length',  label: '8 caractères minimum' },
    { key: 'upper',   label: 'Une majuscule' },
    { key: 'number',  label: 'Un chiffre' },
    { key: 'special', label: 'Un caractère spécial' },
  ];
  return (
    <div className="space-y-4">
      <Field label="Email administrateur *" error={errors.email}>
        <input type="email" value={data.email} onChange={e => setData({ ...data, email: e.target.value })} className="input" placeholder="admin@organisation.fr" />
      </Field>
      <Field label="Mot de passe *" error={errors.password}>
        <input type="password" value={data.password} onChange={e => setData({ ...data, password: e.target.value })} className="input" />
        {data.password && (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {rules.map(r => (
              <div key={r.key} className={clsx('flex items-center gap-1.5 text-xs', s[r.key] ? 'text-emerald-400' : 'text-ink-400')}>
                <div className={clsx('w-1.5 h-1.5 rounded-full', s[r.key] ? 'bg-emerald-400' : 'bg-ink-500')} />
                {r.label}
              </div>
            ))}
          </div>
        )}
      </Field>
      <Field label="Confirmer le mot de passe *" error={errors.confirm}>
        <input type="password" value={data.confirm} onChange={e => setData({ ...data, confirm: e.target.value })} className="input" />
      </Field>
      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="flex items-center gap-1 btn-ghost text-sm">
          <ChevronLeft size={15} /> Retour
        </button>
        <button onClick={() => validate() && onNext()} className="btn-primary flex items-center gap-2">
          Suivant <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function Step4({ org, server, admin, onBack, onNext }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const initialize = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/setup/initialize', {
        organization: org, server,
        admin: { email: admin.email, password: admin.password },
      });
      const blob = new Blob([JSON.stringify(data.recoveryKit, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `securebackup-recovery-kit-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onNext();
    } catch (err) {
      setError(err.response?.data?.error || "Erreur lors de l'initialisation");
    }
    setLoading(false);
  };

  const SummaryRow = ({ label, value }) => value ? (
    <div className="flex py-2 border-b border-ink-600 last:border-0 text-sm">
      <span className="w-40 text-ink-400 shrink-0 text-xs pt-0.5">{label}</span>
      <span className="text-ink-100 text-xs font-mono">{value}</span>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="bg-ink-600 border border-ink-500 rounded-xl p-4 space-y-0">
        <p className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-2">Organisation</p>
        <SummaryRow label="Nom" value={org.name} />
        <SummaryRow label="Secteur" value={org.sector} />
        <SummaryRow label="Email" value={org.email} />
      </div>
      <div className="bg-ink-600 border border-ink-500 rounded-xl p-4">
        <p className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-2">Nœud 1 (Org1)</p>
        <SummaryRow label="Hôte" value={server.host} />
        <SummaryRow label="Port Orderer" value={server.fabricPort} />
        <SummaryRow label="Port API" value={server.apiPort} />
      </div>
      <div className="bg-ink-600 border border-ink-500 rounded-xl p-4">
        <p className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-2">Administrateur</p>
        <SummaryRow label="Email" value={admin.email} />
        <SummaryRow label="Mot de passe" value="••••••••" />
      </div>
      <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 text-xs text-amber-400/90">
        Le kit de récupération sera téléchargé automatiquement. Conservez-le en lieu sûr.
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex justify-between pt-1">
        <button onClick={onBack} className="flex items-center gap-1 btn-ghost text-sm">
          <ChevronLeft size={15} /> Retour
        </button>
        <button onClick={initialize} disabled={loading}
          className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {loading ? 'Initialisation…' : 'Initialiser et continuer'}
        </button>
      </div>
    </div>
  );
}

function Step5() {
  const navigate  = useNavigate();
  const [phase,    setPhase]    = useState('idle');
  const [logs,     setLogs]     = useState([]);
  const [current,  setCurrent]  = useState('');
  const [progress, setProgress] = useState(0);
  const logsRef = useRef(null);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  const STEP_LABELS = {
    start_containers: 'Démarrage Docker',
    wait_orderers:    'Attente Raft',
    create_channel:   'Création du channel',
    join_peers:       'Jointure des peers',
    anchor_peers:     'Configuration anchors',
    deploy_chaincode: 'Déploiement chaincode',
    network:          'Réseau opérationnel',
  };

  const startNetwork = () => {
    setLogs([]); setPhase('running'); setProgress(0);
    const tok = localStorage.getItem('accessToken');
    fetch('/api/deployment/init-network/stream', {
      headers: { Authorization: `Bearer ${tok}` },
    }).then((resp) => {
      const reader  = resp.body.getReader();
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
            if (evt.log)  setLogs(l => [...l, { type: evt.type, text: evt.log }]);
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
      <div className="bg-brand/10 border border-brand/20 rounded-xl p-4 text-sm text-brand/90">
        <p className="font-semibold text-brand mb-1">Démarrage du réseau Hyperledger Fabric</p>
        <p className="text-xs">Cette étape va démarrer les 3 nœuds localement, créer le channel <strong>backupchannel</strong> et déployer le chaincode.</p>
        <p className="mt-1 text-xs text-brand/60">Durée estimée : 2-5 minutes selon la vitesse réseau Docker.</p>
      </div>

      {phase !== 'idle' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-300">
            <span>{current || 'Initialisation…'}</span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div className="h-1.5 bg-ink-600 rounded-full overflow-hidden">
            <div className={clsx('h-full rounded-full transition-all duration-500',
              phase === 'error' ? 'bg-red-500' : 'bg-brand')}
              style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {logs.length > 0 && (
        <div className="bg-ink-900 border border-ink-600 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Terminal size={11} className="text-ink-400" />
            <span className="text-xs text-ink-400 font-semibold uppercase tracking-wider">Logs réseau</span>
            {phase === 'running' && <Loader2 size={10} className="text-brand animate-spin ml-auto" />}
          </div>
          <div ref={logsRef} className="max-h-52 overflow-y-auto space-y-0.5 font-mono text-xs">
            {logs.map((l, i) => (
              <div key={i} className={clsx(
                l.type === 'OK' || l.type === 'DONE' ? 'text-emerald-400'
                : l.type === 'ERROR' ? 'text-red-400'
                : l.type === 'STEP'  ? 'text-brand font-semibold'
                : 'text-ink-200',
              )}>{l.text}</div>
            ))}
            {phase === 'running' && <span className="text-ink-500 animate-pulse">▋</span>}
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-sm text-emerald-400">
          <p className="font-semibold mb-1">Réseau opérationnel</p>
          <p className="text-xs text-emerald-400/80">Les 3 nœuds sont démarrés, le channel est créé, le chaincode est déployé.</p>
          <p className="mt-1 text-xs text-emerald-400/80">Depuis la page <strong className="text-emerald-400">Déploiement</strong>, ajoutez les nœuds 2 et 3 sur vos machines distantes.</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
          Une erreur est survenue. Si le réseau était déjà démarré, vous pouvez ignorer et continuer.
        </div>
      )}

      <div className="flex justify-between pt-2">
        {phase === 'idle' && (
          <button onClick={startNetwork} className="btn-primary flex items-center gap-2 w-full justify-center">
            <Play size={14} /> Démarrer le réseau Fabric
          </button>
        )}
        {phase === 'running' && (
          <button disabled className="w-full flex items-center gap-2 px-5 py-2 bg-ink-600 text-ink-400 rounded-lg text-sm font-medium cursor-not-allowed justify-center">
            <Loader2 size={14} className="animate-spin" /> Démarrage en cours…
          </button>
        )}
        {(phase === 'done' || phase === 'error') && (
          <div className="flex gap-3 w-full">
            {phase === 'error' && (
              <button onClick={startNetwork} className="btn-outline flex items-center gap-2">
                <RefreshCw size={13} /> Relancer
              </button>
            )}
            <button onClick={() => navigate('/login', { replace: true })}
              className="flex-1 flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors justify-center">
              <CheckCircle size={14} /> Accéder au dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const STEPS = [
  { label: 'Organisation', icon: Building2  },
  { label: 'Serveur',      icon: Server     },
  { label: 'Admin',        icon: User       },
  { label: 'Validation',   icon: CheckCircle },
  { label: 'Réseau',       icon: Shield     },
];

export default function Setup() {
  const [step,   setStep]   = useState(0);
  const [org,    setOrg]    = useState({ name: '', legalStatus: 'SA', address: '', postalCode: '', city: '', country: 'France', phone: '', email: '', sector: 'Technologie', taxId: '' });
  const [server, setServer] = useState({ host: '', fabricPort: '7050', ipfsPort: '5001', apiPort: '3000' });
  const [admin,  setAdmin]  = useState({ email: '', password: '', confirm: '' });

  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => s - 1);

  return (
    <div className="min-h-screen bg-ink-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand/15 border border-brand/30 rounded-2xl mb-4">
            <Shield className="text-brand" size={26} />
          </div>
          <h1 className="text-2xl font-bold text-ink-50">Configuration initiale</h1>
          <p className="text-ink-400 text-sm mt-1">SecureBackup-Chain — {STEPS[step].label}</p>
        </div>

        <div className="bg-ink-700 border border-ink-500 rounded-2xl shadow-2xl p-8">
          <StepIndicator current={step} total={STEPS.length} />
          {step === 0 && <Step1 data={org}    setData={setOrg}    onNext={next} />}
          {step === 1 && <Step2 data={server} setData={setServer} onNext={next} onBack={back} />}
          {step === 2 && <Step3 data={admin}  setData={setAdmin}  onNext={next} onBack={back} />}
          {step === 3 && <Step4 org={org} server={server} admin={admin} onBack={back} onNext={next} />}
          {step === 4 && <Step5 serverHost={server.host} />}
        </div>

        <p className="text-center text-ink-500 text-xs mt-4">
          Étape {step + 1} sur {STEPS.length}
        </p>
      </div>
    </div>
  );
}
