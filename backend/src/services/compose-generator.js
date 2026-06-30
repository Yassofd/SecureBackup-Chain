'use strict';

const path = require('path');
const { getPorts, getOrgNames } = require('./port-allocator');

/**
 * Génère le contenu docker-compose YAML pour OrgN en mode mono-hôte.
 * Les conteneurs rejoignent le réseau Docker existant `securebackup-net`.
 *
 * @param {{ orgNum: number, otherNodes?: {orgNum,ip}[], hostNetworkDir?: string }} opts
 */
function generateCompose(opts) {
  const { orgNum } = opts;
  const { org, lower, mspId, domain } = getOrgNames(orgNum);

  // Chemins hôte absolus pour les bind mounts (le daemon Docker tourne sur l'hôte,
  // il ne connaît pas les chemins internes /securebackup/network/).
  const HOST_PROJECT_DIR = process.env.HOST_PROJECT_DIR || path.resolve(__dirname, '../../../../');
  const hostNet = opts.hostNetworkDir || path.join(HOST_PROJECT_DIR, 'network');
  const p = getPorts(orgNum);

  const couchName   = `couchdb${orgNum - 1}`;
  const ipfsName    = `ipfs${orgNum - 1}`;
  const clusterName = `cluster${orgNum - 1}`;
  const ordererVol  = `orderer${orgNum}-data`;
  const peerVol     = `peer0-org${orgNum}-data`;
  const ipfsVol     = `ipfs${orgNum - 1}-data`;
  const clusterVol  = `cluster${orgNum - 1}-data`;

  return `# Auto-generated — Nœud ${orgNum} (${org}) — mono-hôte Docker
networks:
  securebackup-net:
    external: true

services:

  orderer.${domain}:
    image: hyperledger/fabric-orderer:2.5.4
    container_name: orderer.${domain}
    hostname: orderer.${domain}
    restart: unless-stopped
    environment:
      - FABRIC_LOGGING_SPEC=INFO
      - ORDERER_GENERAL_LISTENADDRESS=0.0.0.0
      - ORDERER_GENERAL_LISTENPORT=${p.orderer}
      - ORDERER_GENERAL_GENESISMETHOD=file
      - ORDERER_GENERAL_GENESISFILE=/var/hyperledger/orderer/orderer.genesis.block
      - ORDERER_GENERAL_LOCALMSPID=${org}OrdererMSP
      - ORDERER_GENERAL_LOCALMSPDIR=/var/hyperledger/orderer/msp
      - ORDERER_GENERAL_TLS_ENABLED=true
      - ORDERER_GENERAL_TLS_PRIVATEKEY=/var/hyperledger/orderer/tls/server.key
      - ORDERER_GENERAL_TLS_CERTIFICATE=/var/hyperledger/orderer/tls/server.crt
      - ORDERER_GENERAL_TLS_ROOTCAS=[/var/hyperledger/orderer/tls/ca.crt]
      - ORDERER_GENERAL_CLUSTER_CLIENTCERTIFICATE=/var/hyperledger/orderer/tls/server.crt
      - ORDERER_GENERAL_CLUSTER_CLIENTPRIVATEKEY=/var/hyperledger/orderer/tls/server.key
      - ORDERER_GENERAL_CLUSTER_ROOTCAS=[/var/hyperledger/orderer/tls/ca.crt]
    volumes:
      - ${hostNet}/channel-artifacts/genesis.block:/var/hyperledger/orderer/orderer.genesis.block:ro
      - ${hostNet}/crypto-config/ordererOrganizations/${domain}/orderers/orderer.${domain}/msp:/var/hyperledger/orderer/msp:ro
      - ${hostNet}/crypto-config/ordererOrganizations/${domain}/orderers/orderer.${domain}/tls:/var/hyperledger/orderer/tls:ro
      - ${ordererVol}:/var/hyperledger/production/orderer
    ports:
      - "${p.orderer}:${p.orderer}"
    networks:
      - securebackup-net

  ca.${domain}:
    image: hyperledger/fabric-ca:1.5.7
    container_name: ca.${domain}
    hostname: ca.${domain}
    restart: unless-stopped
    environment:
      - FABRIC_CA_HOME=/etc/hyperledger/fabric-ca-server
      - FABRIC_CA_SERVER_CA_NAME=ca-${lower}
      - FABRIC_CA_SERVER_TLS_ENABLED=true
      - FABRIC_CA_SERVER_PORT=${p.ca}
    command: sh -c 'fabric-ca-server start -b admin:adminpw -d'
    volumes:
      - ${hostNet}/crypto-config/peerOrganizations/${domain}/ca/:/etc/hyperledger/fabric-ca-server-config:ro
    ports:
      - "${p.ca}:${p.ca}"
    networks:
      - securebackup-net

  ${couchName}:
    image: couchdb:3.3
    container_name: ${couchName}
    restart: unless-stopped
    environment:
      - COUCHDB_USER=admin
      - COUCHDB_PASSWORD=adminpw
    ports:
      - "${p.couchHost}:5984"
    networks:
      - securebackup-net

  peer0.${domain}:
    image: hyperledger/fabric-peer:2.5.4
    container_name: peer0.${domain}
    hostname: peer0.${domain}
    restart: unless-stopped
    depends_on:
      - orderer.${domain}
      - ${couchName}
    environment:
      - CORE_VM_ENDPOINT=unix:///host/var/run/docker.sock
      - CORE_VM_DOCKER_HOSTCONFIG_NETWORKMODE=securebackup-net
      - FABRIC_LOGGING_SPEC=INFO
      - CORE_PEER_TLS_ENABLED=true
      - CORE_PEER_TLS_CERT_FILE=/etc/hyperledger/fabric/tls/server.crt
      - CORE_PEER_TLS_KEY_FILE=/etc/hyperledger/fabric/tls/server.key
      - CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/tls/ca.crt
      - CORE_PEER_ID=peer0.${domain}
      - CORE_PEER_ADDRESS=peer0.${domain}:${p.peer}
      - CORE_PEER_LISTENADDRESS=0.0.0.0:${p.peer}
      - CORE_PEER_CHAINCODEADDRESS=peer0.${domain}:${p.chaincode}
      - CORE_PEER_CHAINCODELISTENADDRESS=0.0.0.0:${p.chaincode}
      - CORE_PEER_GOSSIP_BOOTSTRAP=peer0.${domain}:${p.peer}
      - CORE_PEER_GOSSIP_EXTERNALENDPOINT=peer0.${domain}:${p.peer}
      - CORE_PEER_LOCALMSPID=${mspId}
      - CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/msp
      - CORE_LEDGER_STATE_STATEDATABASE=CouchDB
      - CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS=${couchName}:5984
      - CORE_LEDGER_STATE_COUCHDBCONFIG_USERNAME=admin
      - CORE_LEDGER_STATE_COUCHDBCONFIG_PASSWORD=adminpw
    volumes:
      - /var/run/docker.sock:/host/var/run/docker.sock
      - ${hostNet}/crypto-config/peerOrganizations/${domain}/peers/peer0.${domain}/msp:/etc/hyperledger/fabric/msp:ro
      - ${hostNet}/crypto-config/peerOrganizations/${domain}/peers/peer0.${domain}/tls:/etc/hyperledger/fabric/tls:ro
      - ${peerVol}:/var/hyperledger/production
    ports:
      - "${p.peer}:${p.peer}"
    networks:
      - securebackup-net

  ${ipfsName}:
    image: ipfs/kubo:latest
    container_name: ${ipfsName}
    restart: unless-stopped
    environment:
      - IPFS_PROFILE=server
    volumes:
      - ${ipfsVol}:/data/ipfs
    ports:
      - "${p.swarm}:4001"
      - "${p.ipfs}:5001"
      - "${p.gateway}:8080"
    networks:
      - securebackup-net

  ${clusterName}:
    image: ipfs/ipfs-cluster:latest
    container_name: ${clusterName}
    restart: unless-stopped
    depends_on:
      - ${ipfsName}
    environment:
      - CLUSTER_PEERNAME=${clusterName}
      - CLUSTER_SECRET=\${CLUSTER_SECRET}
      - CLUSTER_IPFSHTTP_NODEMULTIADDRESS=/dns4/${ipfsName}/tcp/5001
      - CLUSTER_CRDT_TRUSTEDPEERS=*
      - CLUSTER_RESTAPI_HTTPLISTENMULTIADDRESS=/ip4/0.0.0.0/tcp/${p.clusterApi}
      - CLUSTER_MONITORPINGINTERVAL=2s
    ports:
      - "${p.clusterApi}:${p.clusterApi}"
      - "${p.clusterSwarm}:9096"
    volumes:
      - ${clusterVol}:/data/ipfs-cluster
    networks:
      - securebackup-net

volumes:
  ${ordererVol}:
  ${peerVol}:
  ${ipfsVol}:
  ${clusterVol}:
`;
}

module.exports = { generateCompose };
