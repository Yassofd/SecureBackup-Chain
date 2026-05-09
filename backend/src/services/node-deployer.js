'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync } = require('child_process');

const sshService                = require('./ssh');
const { getPorts, getOrgNames } = require('./port-allocator');
const { generateCompose }       = require('./compose-generator');
const { generateOrgCrypto }     = require('./crypto-generator');
const { addOrgToChannel }       = require('./channel-updater');
const logger                    = require('../utils/logger');

const NETWORK_DIR   = path.resolve(__dirname, '../../../network');
const CRYPTO_DIR    = path.join(NETWORK_DIR, 'crypto-config');
const ARTIFACTS_DIR = path.join(NETWORK_DIR, 'channel-artifacts');
const REMOTE_BASE   = '/opt/securebackup-chain';

const STEPS = [
  { id: 'connect',     label: 'Connexion SSH',                pct: 4  },
  { id: 'crypto',      label: 'Génération des certificats',   pct: 10 },
  { id: 'channel',     label: 'Mise à jour du channel',       pct: 20 },
  { id: 'docker',      label: 'Vérification Docker',          pct: 26 },
  { id: 'mkdir',       label: 'Création des répertoires',     pct: 32 },
  { id: 'certs',       label: 'Transfert des certificats',    pct: 55 },
  { id: 'artifacts',   label: 'Transfert channel artifacts',  pct: 62 },
  { id: 'compose',     label: 'Transfert docker-compose',     pct: 67 },
  { id: 'chaincode',   label: 'Transfert chaincode',          pct: 72 },
  { id: 'env',         label: 'Configuration .env',           pct: 74 },
  { id: 'pull',        label: 'Téléchargement images Docker', pct: 84 },
  { id: 'start',       label: 'Démarrage des services',       pct: 92 },
  { id: 'join',        label: 'Jointure du channel Fabric',   pct: 95 },
  { id: 'ccinstall',   label: 'Installation du chaincode',    pct: 97 },
  { id: 'update_node1',label: 'Mise à jour Nœud 1',          pct: 99 },
  { id: 'done',        label: 'Déploiement terminé',          pct: 100 },
];

function packDir(localDir) {
  const base    = path.dirname(localDir);
  const dirName = path.basename(localDir);
  const tmp     = path.join(os.tmpdir(), `sbchain_${Date.now()}.tar.gz`);
  execSync(`tar -czf "${tmp}" -C "${base}" "${dirName}"`);
  return tmp;
}

/**
 * @param {object}   options
 * @param {number}   options.orgNum       — auto-assigné par l'API (>= 2)
 * @param {string}   options.sshHost
 * @param {number}   [options.sshPort=22]
 * @param {string}   options.sshUser
 * @param {string}   [options.sshPassword]
 * @param {string}   [options.sshKey]
 * @param {string}   options.nodeIp       — IP publique du nœud distant (pour extra_hosts)
 * @param {object[]} options.knownNodes   — [ { orgNum, ip } ] nœuds déjà enregistrés en DB
 * @param {string}   [options.chaincodeId]
 */
async function deployNode(options, onEvent) {
  const {
    orgNum, sshHost, sshPort = 22, sshUser, sshPassword, sshKey,
    nodeIp, knownNodes = [], chaincodeId,
  } = options;

  const { org, lower, domain } = getOrgNames(orgNum);
  const ports   = getPorts(orgNum);
  const compose = `docker-compose-node${orgNum}.yaml`;

  const emit = (stepId, extra = {}) => {
    const step = STEPS.find((s) => s.id === stepId);
    onEvent({ step: stepId, label: step?.label || stepId, progress: step?.pct || 0, ...extra });
  };

  const sshParams = {
    host: sshHost, port: sshPort, username: sshUser,
    auth_type: sshKey ? 'key' : 'password',
    credentials: sshKey ? { privateKey: sshKey } : { password: sshPassword },
  };

  let ssh;
  try {
    // ── 1. Connexion SSH ─────────────────────────────────────────────────────
    emit('connect', { log: `Connexion SSH ${sshUser}@${sshHost}:${sshPort}…` });
    ssh = await sshService.connect(sshParams);
    emit('connect', { log: 'Connexion établie' });

    // ── 2. Génération crypto locale ──────────────────────────────────────────
    emit('crypto', { log: `Génération des certificats pour ${org}…` });
    const cryptoResult = generateOrgCrypto(orgNum);
    emit('crypto', { log: cryptoResult.alreadyExists ? `Certificats ${org} déjà présents` : `Certificats ${org} générés` });

    // ── 3. Mise à jour du channel ────────────────────────────────────────────
    emit('channel', { log: `Ajout de ${org} au channel backupchannel…` });
    try {
      await addOrgToChannel(orgNum);
      emit('channel', { log: `${org} ajouté au channel avec succès` });
    } catch (err) {
      if (err.message?.includes('already exists') || err.message?.includes('existing')) {
        emit('channel', { log: `${org} déjà présent dans le channel — on continue`, warn: true });
      } else {
        emit('channel', { log: `Avertissement channel update : ${err.message.slice(0, 150)}`, warn: true });
      }
    }

    // ── 4. Vérifier / installer Docker ───────────────────────────────────────
    emit('docker', { log: 'Vérification de Docker…' });
    const dockerVer = await ssh.execCommand('docker --version 2>/dev/null || echo MISSING');
    if (dockerVer.stdout.includes('MISSING')) {
      emit('docker', { log: 'Docker absent — installation (2-3 min)…' });
      const install = await ssh.execCommand('curl -fsSL https://get.docker.com | sh && systemctl enable --now docker');
      if (install.code !== 0) throw new Error(`Échec installation Docker : ${install.stderr}`);
      emit('docker', { log: 'Docker installé' });
    } else {
      emit('docker', { log: `Docker OK : ${dockerVer.stdout.trim()}` });
    }

    // ── 5. Créer répertoires ─────────────────────────────────────────────────
    emit('mkdir', { log: `Création de ${REMOTE_BASE}/network…` });
    await ssh.execCommand([
      `mkdir -p ${REMOTE_BASE}/network/crypto-config/ordererOrganizations`,
      `mkdir -p ${REMOTE_BASE}/network/crypto-config/peerOrganizations`,
      `mkdir -p ${REMOTE_BASE}/network/channel-artifacts`,
      `mkdir -p ${REMOTE_BASE}/chaincode`,
    ].join(' && '));
    emit('mkdir', { log: 'Répertoires créés' });

    // ── 6. Transfert certificats ─────────────────────────────────────────────
    emit('certs', { log: `Compression crypto-config/${lower}…` });
    const ordererDir = path.join(CRYPTO_DIR, 'ordererOrganizations', domain);
    const peerDir    = path.join(CRYPTO_DIR, 'peerOrganizations',    domain);
    const ordererTar = packDir(ordererDir);
    const peerTar    = packDir(peerDir);

    emit('certs', { log: 'Envoi ordererOrganizations…' });
    await ssh.putFile(ordererTar, `/tmp/orderer_${lower}.tar.gz`);
    await ssh.execCommand(`tar -xzf /tmp/orderer_${lower}.tar.gz -C ${REMOTE_BASE}/network/crypto-config/ordererOrganizations && rm /tmp/orderer_${lower}.tar.gz`);

    emit('certs', { log: 'Envoi peerOrganizations…' });
    await ssh.putFile(peerTar, `/tmp/peer_${lower}.tar.gz`);
    await ssh.execCommand(`tar -xzf /tmp/peer_${lower}.tar.gz -C ${REMOTE_BASE}/network/crypto-config/peerOrganizations && rm /tmp/peer_${lower}.tar.gz`);

    fs.unlinkSync(ordererTar);
    fs.unlinkSync(peerTar);
    emit('certs', { log: 'Certificats transférés' });

    // ── 7. Transfert channel artifacts ──────────────────────────────────────
    emit('artifacts', { log: 'Envoi genesis.block et backupchannel.block…' });
    await ssh.putFile(path.join(ARTIFACTS_DIR, 'genesis.block'), `${REMOTE_BASE}/network/channel-artifacts/genesis.block`);
    const channelBlock = path.join(ARTIFACTS_DIR, 'backupchannel.block');
    if (fs.existsSync(channelBlock)) {
      await ssh.putFile(channelBlock, `${REMOTE_BASE}/network/channel-artifacts/backupchannel.block`);
    }
    emit('artifacts', { log: 'Artifacts transférés' });

    // ── 8. Génération + transfert docker-compose ─────────────────────────────
    emit('compose', { log: `Génération ${compose}…` });
    const allNodes       = [...knownNodes, { orgNum, ip: nodeIp }];
    const composeContent = generateCompose({ orgNum, otherNodes: allNodes });
    const tmpCompose     = path.join(os.tmpdir(), compose);
    fs.writeFileSync(tmpCompose, composeContent);
    await ssh.putFile(tmpCompose, `${REMOTE_BASE}/network/${compose}`);
    fs.unlinkSync(tmpCompose);
    emit('compose', { log: 'docker-compose transféré' });

    // ── 9. Transfert chaincode ───────────────────────────────────────────────
    emit('chaincode', { log: 'Compression chaincode…' });
    const chaincodeLocal = path.resolve(NETWORK_DIR, '../chaincode');
    if (fs.existsSync(chaincodeLocal)) {
      const chaincodeTar = packDir(chaincodeLocal);
      await ssh.putFile(chaincodeTar, '/tmp/chaincode.tar.gz');
      await ssh.execCommand(`tar -xzf /tmp/chaincode.tar.gz -C ${REMOTE_BASE} && rm /tmp/chaincode.tar.gz`);
      fs.unlinkSync(chaincodeTar);
    }
    emit('chaincode', { log: 'Chaincode transféré' });

    // ── 10. Écriture .env ────────────────────────────────────────────────────
    emit('env', { log: 'Génération .env…' });
    const envLines = allNodes.map((n) => `ORG${n.orgNum}_IP=${n.ip}`);
    envLines.push(`CHAINCODE_ID=${chaincodeId || 'backup-cc_1.0:placeholder'}`);
    const tmpEnv = path.join(os.tmpdir(), `.env_node${orgNum}_${Date.now()}`);
    fs.writeFileSync(tmpEnv, envLines.join('\n') + '\n');
    await ssh.putFile(tmpEnv, `${REMOTE_BASE}/network/.env`);
    fs.unlinkSync(tmpEnv);
    emit('env', { log: '.env créé' });

    // ── 11. Pull images Docker ───────────────────────────────────────────────
    emit('pull', { log: 'Téléchargement des images (3-5 min)…' });
    const pullResult = await ssh.execCommand(
      `cd ${REMOTE_BASE}/network && docker compose -f ${compose} --env-file .env pull 2>&1 | tail -5`,
    );
    emit('pull', { log: pullResult.stdout || 'Images prêtes' });

    // ── 12. Démarrage ────────────────────────────────────────────────────────
    emit('start', { log: 'Démarrage des services Docker…' });
    const startResult = await ssh.execCommand(
      `cd ${REMOTE_BASE}/network && docker compose -f ${compose} --env-file .env up -d 2>&1`,
    );
    if (startResult.code !== 0) {
      throw new Error(`docker compose up échoué (code ${startResult.code}) : ${startResult.stdout || startResult.stderr}`);
    }
    emit('start', { log: 'Services démarrés — attente 15s…' });
    await new Promise((r) => setTimeout(r, 15000));

    const psResult = await ssh.execCommand(
      `docker compose -f ${REMOTE_BASE}/network/${compose} --env-file ${REMOTE_BASE}/network/.env ps --format "table {{.Name}}\\t{{.Status}}" 2>&1`,
    );
    const psOut = psResult.stdout.trim();
    emit('start', { log: psOut || 'Aucun conteneur retourné' });
    const runningCount = (psOut.match(/Up|running/gi) || []).length;
    if (runningCount === 0) {
      const logsResult = await ssh.execCommand(
        `docker compose -f ${REMOTE_BASE}/network/${compose} --env-file ${REMOTE_BASE}/network/.env logs --tail=20 2>&1`,
      );
      throw new Error(`Aucun conteneur actif.\n${logsResult.stdout.slice(0, 500)}`);
    }
    emit('start', { log: `${runningCount} conteneur(s) actif(s)` });

    // ── 13. Jointure channel ─────────────────────────────────────────────────
    const blockPath   = `${REMOTE_BASE}/network/channel-artifacts/backupchannel.block`;
    const blockExists = await ssh.execCommand(`test -f ${blockPath} && echo yes || echo no`);
    if (blockExists.stdout.trim() === 'yes') {
      emit('join', { log: `Jointure de peer0.${lower} au channel backupchannel…` });
      const joinCmd = [
        `docker run --rm`,
        `--network securebackup-fabric`,
        `-v ${REMOTE_BASE}/network/crypto-config:/etc/hyperledger/crypto-config`,
        `-v ${REMOTE_BASE}/network/channel-artifacts:/etc/hyperledger/channel-artifacts`,
        `-e CORE_PEER_LOCALMSPID=${org}MSP`,
        `-e CORE_PEER_TLS_ENABLED=true`,
        `-e CORE_PEER_ADDRESS=peer0.${domain}:${ports.peer}`,
        `-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/${domain}/users/Admin@${domain}/msp`,
        `-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/${domain}/peers/peer0.${domain}/tls/ca.crt`,
        `hyperledger/fabric-tools:2.5.4`,
        `peer channel join -b /etc/hyperledger/channel-artifacts/backupchannel.block`,
      ].join(' ');
      const joinResult = await ssh.execCommand(joinCmd);
      if (joinResult.code === 0) {
        emit('join', { log: `peer0.${lower} a rejoint backupchannel` });
      } else {
        emit('join', { log: `Jointure échouée — ${joinResult.stderr.slice(0, 200)}`, warn: true });
      }
    } else {
      emit('join', { log: 'backupchannel.block absent — jointure manuelle', warn: true });
    }

    // ── 14. Installation du chaincode ────────────────────────────────────────
    emit('ccinstall', { log: 'Installation du chaincode backup-cc sur le peer…' });
    const ccPackage = path.join(ARTIFACTS_DIR, 'backup-cc.tar.gz');
    if (fs.existsSync(ccPackage)) {
      const remoteCcPkg = `${REMOTE_BASE}/network/channel-artifacts/backup-cc.tar.gz`;
      // Transférer le package si pas déjà là
      await ssh.putFile(ccPackage, remoteCcPkg);
      const ccInstallCmd = [
        `docker run --rm`,
        `--network securebackup-fabric`,
        `-v ${REMOTE_BASE}/network/crypto-config:/etc/hyperledger/crypto-config`,
        `-v ${REMOTE_BASE}/network/channel-artifacts:/etc/hyperledger/channel-artifacts`,
        `-e CORE_PEER_LOCALMSPID=${org}MSP`,
        `-e CORE_PEER_TLS_ENABLED=true`,
        `-e CORE_PEER_ADDRESS=peer0.${domain}:${ports.peer}`,
        `-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/${domain}/users/Admin@${domain}/msp`,
        `-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/${domain}/peers/peer0.${domain}/tls/ca.crt`,
        `hyperledger/fabric-tools:2.5.4`,
        `peer lifecycle chaincode install /etc/hyperledger/channel-artifacts/backup-cc.tar.gz`,
      ].join(' ');
      const ccResult = await ssh.execCommand(ccInstallCmd);
      if (ccResult.code === 0) {
        emit('ccinstall', { log: 'Chaincode installé sur peer0.' + lower });
      } else {
        emit('ccinstall', { log: `Installation chaincode échouée — ${ccResult.stderr.slice(0, 200)}`, warn: true });
      }
    } else {
      emit('ccinstall', { log: 'Package backup-cc.tar.gz introuvable — installation manuelle nécessaire', warn: true });
    }

    // ── 15. Mettre à jour le .env du Nœud 1 ────────────────────────────────────
    emit('update_node1', { log: `Mise à jour du .env de Nœud 1 avec ORG${orgNum}_IP=${nodeIp}…` });
    try {
      const envNode1Path = path.join(NETWORK_DIR, '.env.node1');
      const envSymlink   = path.join(NETWORK_DIR, '.env');

      // Lire le fichier actuel ou créer un vide
      let envContent = '';
      if (fs.existsSync(envNode1Path)) {
        envContent = fs.readFileSync(envNode1Path, 'utf8');
      }

      const newKey = `ORG${orgNum}_IP`;
      const lines  = envContent.split('\n').filter(Boolean);
      const idx    = lines.findIndex((l) => l.startsWith(`${newKey}=`));
      if (idx >= 0) {
        lines[idx] = `${newKey}=${nodeIp}`;
      } else {
        lines.push(`${newKey}=${nodeIp}`);
      }

      const updated = lines.join('\n') + '\n';
      fs.writeFileSync(envNode1Path, updated);
      fs.copyFileSync(envNode1Path, envSymlink);
      emit('update_node1', { log: `.env.node1 mis à jour — rechargement des conteneurs Nœud 1…` });

      // Relancer docker-compose Node1 pour rafraîchir les extra_hosts
      execSync(
        `docker compose -f "${path.join(NETWORK_DIR, 'docker-compose-node1.yaml')}" --env-file "${envSymlink}" up -d 2>&1`,
        { cwd: NETWORK_DIR, stdio: 'pipe' },
      );
      emit('update_node1', { log: 'Conteneurs Nœud 1 rechargés — extra_hosts mis à jour' });
    } catch (envErr) {
      emit('update_node1', { log: `Avertissement mise à jour Nœud 1 : ${envErr.message.slice(0, 200)}`, warn: true });
    }

    emit('done', { log: `Nœud ${orgNum} (${org}) déployé sur ${sshHost}`, success: true });
    logger.info(`[node-deployer] ${org} deployed to ${sshHost}`);
    return { success: true };

  } catch (err) {
    logger.error(`[node-deployer] Erreur : ${err.message}`);
    onEvent({ step: 'error', label: 'Erreur', progress: 0, error: err.message, log: `ERREUR : ${err.message}` });
    return { success: false, error: err.message };
  } finally {
    if (ssh) await sshService.closeConnection(ssh).catch(() => {});
  }
}

module.exports = { deployNode, STEPS };
