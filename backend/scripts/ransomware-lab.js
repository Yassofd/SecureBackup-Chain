'use strict';
/*
 * ransomware-lab.js
 * =============================================================================
 * Démonstration PÉDAGOGIQUE de la résistance de SecureBackup-Chain face à une
 * attaque par ransomware (chiffrement malveillant des données / corruption).
 *
 * Ce script est 100 % AUTONOME : il n'a besoin NI de Docker, NI de Fabric,
 * NI d'IPFS, NI de `npm install`. Il réutilise les VRAIES fonctions
 * cryptographiques du projet (backend/src/services/crypto.js) et SIMULE
 * fidèlement :
 *   - IPFS   : un stockage adressé par contenu (CID = empreinte SHA-256)
 *   - Fabric : un ledger immuable qui ancre le hash du fichier EN CLAIR
 *
 * Il reproduit exactement le pipeline de la route POST /api/backups :
 *     clair ──► AES-256-CBC (createEncryptStream) ──► octets stockés ("IPFS")
 *     clair ──► SHA-256                            ──► hash ancré    ("Fabric")
 *
 * Lancer :  node scripts/ransomware-lab.js
 * =============================================================================
 */

const { createEncryptStream, decryptAES, sha256 } = require('../src/services/crypto');

// ── Couleurs / style console ────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', magenta: '\x1b[35m',
};
const hr      = () => console.log(c.dim + '─'.repeat(78) + c.reset);
const scen    = (n, t) => console.log(`\n${c.bold}${c.cyan}🎯 SCÉNARIO ${n} — ${t}${c.reset}`);
const attack  = (t) => console.log(c.red + '  👾 ATTAQUE  ' + c.reset + t);
const step    = (t) => console.log(c.blue + '  ▸ ' + c.reset + t);
const ok      = (t) => console.log(c.green + '  ✅ ' + c.reset + t);
const warn    = (t) => console.log(c.yellow + '  ⚠️  ' + c.reset + t);
const proof   = (t) => console.log(c.green + '  🛡️  GARANTIE ' + c.reset + c.bold + t + c.reset);
const note    = (t) => console.log(c.dim + '       ' + t + c.reset);

// En production cette clé vient de la variable d'env MASTER_KEY (openssl rand -hex 32).
const MASTER_KEY = 'a839c23c58aa888b60e4aababa00746368205eae8c0ecb86917e3334a574deaf';
// Clé d'un ATTAQUANT — totalement différente, pour illustrer un mauvais déchiffrement.
const ATTACKER_KEY = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION D'IPFS — stockage adressé par contenu (comme les vrais CID)
// ═══════════════════════════════════════════════════════════════════════════
const ipfsStore = new Map(); // CID (hex) → octets chiffrés réellement stockés

async function ipfsAdd(asyncIterable) {
  const chunks = [];
  for await (const chunk of asyncIterable) chunks.push(chunk);
  const stored = Buffer.concat(chunks);
  // Le CID est l'EMPREINTE du contenu stocké : c'est le principe du content-
  // addressing. Deux contenus différents ⇒ deux CID différents, toujours.
  const cid = 'Qm' + sha256(stored).slice(0, 44);
  ipfsStore.set(cid, stored);
  return cid;
}
function ipfsCat(cid) {
  if (!ipfsStore.has(cid)) throw new Error(`CID ${cid} introuvable sur IPFS`);
  return ipfsStore.get(cid);
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION DU LEDGER FABRIC — reproduit chaincode/lib/backup-contract.js
// ═══════════════════════════════════════════════════════════════════════════
const ledger = new Map(); // backupId → entrée (immuable sauf compteurs de vérif.)

function fabricRegisterBackup(backupId, cid, fileName, fileHash, fileSize) {
  if (ledger.has(backupId)) throw new Error(`La sauvegarde ${backupId} existe déjà`);
  const entry = {
    backupId, cid, fileName, fileHash, fileSize,
    status: 'ACTIVE', verificationCount: 0, lastVerification: null,
  };
  ledger.set(backupId, entry);
  return entry;
}
function fabricGetBackup(backupId) {
  const e = ledger.get(backupId);
  if (!e) throw new Error(`Sauvegarde ${backupId} introuvable`);
  return e;
}
// Équivalent de verifyIntegrity : compare le hash fourni au hash ancré.
// NB : le champ fileHash n'est JAMAIS réécrit — il reste la preuve d'origine.
function fabricVerifyIntegrity(backupId, providedHash) {
  const e = fabricGetBackup(backupId);
  const valid = e.fileHash === providedHash;
  e.verificationCount += 1;
  e.lastVerification = { valid };
  ledger.set(backupId, e);
  return { backupId, valid };
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE MÉTIER — fidèle à la route POST /api/backups
// ═══════════════════════════════════════════════════════════════════════════
async function backupFile(plainBuffer, fileName) {
  // createEncryptStream hashe le CLAIR et chiffre en AES-256-CBC en 1 passe.
  const { stream: encStream, getHash, getSize } = createEncryptStream(
    (async function* () { yield plainBuffer; })(),
    MASTER_KEY,
  );
  const cid      = await ipfsAdd(encStream);        // consomme le stream
  const fileHash = getHash();                        // hash du CLAIR (après conso)
  const size     = getSize();
  const backupId = 'bk_' + sha256(Buffer.from(fileName)).slice(0, 12);
  const entry = fabricRegisterBackup(backupId, cid, fileName, fileHash, size);
  return { backupId, cid, fileHash, size, entry };
}

// Restauration fidèle à GET /api/backups/:id/download : IPFS → déchiffrement.
function restoreFile(backupId) {
  const entry  = fabricGetBackup(backupId);
  const stored = ipfsCat(entry.cid);                 // octets chiffrés sains
  const plain  = decryptAES(stored, MASTER_KEY);      // vraie fonction du projet
  return { entry, plain };
}

// Vérifie un fichier candidat contre le hash ancré sur Fabric.
function checkIntegrity(backupId, candidateBuffer) {
  const computed = sha256(candidateBuffer);
  return { computed, ...fabricVerifyIntegrity(backupId, computed) };
}

// ═══════════════════════════════════════════════════════════════════════════
// DÉROULEMENT PÉDAGOGIQUE
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(c.bold + c.magenta + '\n🔐 SecureBackup-Chain — Lab de résistance aux ransomwares' + c.reset);
  console.log(c.dim + 'Chaque scénario simule une attaque réelle, puis montre la contre-mesure.\n' + c.reset);
  hr();

  // ── Données d'exemple : un fichier "métier" sensible ──────────────────────
  const sensitive = Buffer.from(
    'RIB;CLIENT;MONTANT\n' +
    'FR7630001007941234567890185;Alice Dupont;15230.00\n' +
    'FR7630006000011234567890189;Bob Martin;-980.50\n'.repeat(200),
  );
  console.log(c.bold + '📄 Fichier source (données bancaires sensibles)' + c.reset);
  console.log(`   Taille : ${(sensitive.length / 1024).toFixed(1)} Ko   hash clair : ${sha256(sensitive).slice(0, 24)}…`);

  // ═════════════════════════════════════════════════════════════════════════
  scen(1, 'Le ransomware CHIFFRE les fichiers de l’utilisateur et demande une rançon');
  attack('Un malware chiffre tous les fichiers du poste, y compris la "source".');
  const { backupId, cid, fileHash } = await backupFile(sensitive, 'clients-rib.csv');
  step('Avant l’attaque, une sauvegarde saine existe :');
  console.log(`       CID (IPFS)     : ${cid}`);
  console.log(`       hash (Fabric)  : ${fileHash.slice(0, 24)}…`);

  // L'attaquant chiffre le fichier local avec SA clé (rançon).
  const { encryptAES } = require('../src/services/crypto');
  const hostage = encryptAES(sensitive, ATTACKER_KEY);
  warn(`Fichier local désormais chiffré par le ransomware (${(hostage.length / 1024).toFixed(1)} Ko illisibles sans la rançon).`);

  step('On ignore la rançon : on RESTAURE depuis SecureBackup-Chain.');
  const { plain } = restoreFile(backupId);
  if (plain.equals(sensitive)) ok('Fichier restauré à l’identique depuis IPFS + Fabric — la rançon est inutile.');
  else warn('Échec de restauration.');

  const v1 = checkIntegrity(backupId, plain);
  step('Vérification d’intégrité post-restauration :');
  if (v1.valid) ok('verifyIntegrity → VALIDE (hash recalculé = hash ancré)');
  else warn('verifyIntegrity → INVALIDE');
  proof('La sauvegarde chiffrée côté client survit au ransomware ; la restauration régénère l’original.');
  note('Le MASTER_KEY n’est PAS sur le poste compromis → le ransomware ne peut ni lire ni “re-chiffrer pour rançon”.');

  // ═════════════════════════════════════════════════════════════════════════
  scen(2, 'Le ransomware TENTE de modifier une sauvegarde stockée sur IPFS');
  attack('L’attaquant remplace 1 octet du contenu stocké pour le corrompre.');
  const tampered = Buffer.from(ipfsCat(cid));
  tampered[tampered.length - 1] ^= 0x01; // flip d’un seul bit

  const tamperedCid = 'Qm' + sha256(tampered).slice(0, 44);
  step(`Octet altéré → nouvelle empreinte calculée : ${tamperedCid.slice(0, 20)}…`);
  if (tamperedCid !== cid) ok(`Le CID change (${cid.slice(0, 12)}… → ${tamperedCid.slice(0, 12)}…) : le contenu altéré est un AUTRE objet.`);
  const entry2 = fabricGetBackup(backupId);
  step('Le ledger Fabric continue de pointer sur le CID d’origine :');
  console.log(`       CID ancré : ${entry2.cid.slice(0, 20)}…  (inaltéré)`);
  if (entry2.cid === cid) ok('La référence reste valide → la corruption ne peut pas se substituer silencieusement.');
  proof('Content-addressing IPFS : toute altération produit un CID différent, détectable.');

  // ═════════════════════════════════════════════════════════════════════════
  scen(3, 'Un fichier “rançonné” est soumis à la sauvegarde/vérification');
  attack('Par erreur, on tente de vérifier un fichier déjà chiffré par l’attaquant.');
  const v3 = checkIntegrity(backupId, hostage);
  step(`hash recalculé du fichier rançonné : ${v3.computed.slice(0, 20)}…`);
  step(`hash ancré sur Fabric              : ${fileHash.slice(0, 20)}…`);
  if (!v3.valid) ok('verifyIntegrity → INVALIDE : la corruption est DÉTECTÉE avant toute décision.');
  else warn('Cas non détecté (inattendu).');
  proof('L’ancrage du hash SHA-256 sur le ledger Fabric rend toute altération traçable et bloquante.');

  // ═════════════════════════════════════════════════════════════════════════
  scen(4, 'Confidentialité — un attaquant LIT directement les octets sur IPFS');
  attack('Accès en lecture aux données stockées sur IPFS (fuite du nœud).');
  const leaked = ipfsCat(cid);
  step(`Aperçu des octets stockés : ${leaked.slice(0, 24).toString('hex')}`);
  if (!leaked.includes(Buffer.from('Alice Dupont'))) ok('Aucune donnée en clair visible : le contenu est chiffré AES-256 au repos.');
  step('Tentative de déchiffrement avec une clé étrangère…');
  let decryptedWithWrongKey = null;
  try { decryptedWithWrongKey = decryptAES(leaked, ATTACKER_KEY); } catch (_) { /* padding invalide */ }
  if (!decryptedWithWrongKey || !decryptedWithWrongKey.includes(Buffer.from('Alice'))) {
    ok('Déchiffrement impossible sans le MASTER_KEY → pas de fuite exploitable.');
  }
  proof('AES-256-CBC au repos : même à accès complet au stockage, les données restent illisibles.');

  // ═════════════════════════════════════════════════════════════════════════
  hr();
  console.log(c.bold + c.magenta + '\n📋 RÉCAPITULATIF — Menaces couvertes' + c.reset + '\n');
  const rows = [
    ['Ransomware chiffre les fichiers locaux', 'Restauration depuis IPFS (chiffré sain)'],
    ['Altération d’une sauvegarde stockée', 'CID = empreinte → altération détectable'],
    ['Vérif. d’un fichier corrompu/rançonné', 'Hash SHA-256 ancré sur Fabric → INVALIDE'],
    ['Lecture directe des octets IPFS', 'AES-256 au repos → illisible sans MASTER_KEY'],
    ['Effacement/altération du ledger métier', 'Réplication Fabric (multi-org/Raft) → immuable'],
  ];
  for (const [menace, contre] of rows) {
    console.log('   ' + c.red + '✗' + c.reset + ' ' + menace.padEnd(40) + c.dim + '→' + c.reset + ' ' + c.green + contre + c.reset);
  }
  console.log(c.dim + '\nNote : ce lab valide les garanties cryptographiques (crypto.js réel du projet).' + c.reset);
  console.log(c.dim + 'La réplication multi-org/Raft se teste, elle, sur un réseau Fabric déployé.\n' + c.reset);
}

main().catch((err) => { console.error(c.red + '\n💥 Erreur dans le lab :' + c.reset, err); process.exit(1); });

