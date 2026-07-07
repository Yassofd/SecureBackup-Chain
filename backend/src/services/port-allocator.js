'use strict';

// Schéma de ports par orgNum (1-based)
// Org1 : orderer=7050, peer=7051, cc=7052, ca=7054, couch=5984(int)/6984(ext), ipfs=5001, swarm=4001, gw=8080
//        cluster REST=9094, cluster swarm=9096
// OrgN : base = 6000 + N*1000
//   orderer = base+50, peer = base+51, cc = base+52, ca = base+54
//   couch (host) = 5984 + (N-1)*1000
//   ipfs API = 5000 + N, swarm = 4000 + N, gateway = 8079 + N
//   cluster REST = 9094 + (N-1)*1000, cluster swarm = 9096 + (N-1)*1000

function getPorts(orgNum) {
  const n = Number(orgNum);
  if (n === 1) {
    return {
      orderer: 7050, ordererAdmin: 7043,
      peer: 7051, chaincode: 7052, ca: 7054,
      couchHost: 5984, ipfs: 5001, swarm: 4001, gateway: 8080,
      clusterApi: 9094, clusterSwarm: 9096,
    };
  }
  const base = 6000 + n * 1000;
  return {
    orderer:      base + 50,
    ordererAdmin: base + 43,
    peer:         base + 51,
    chaincode:    base + 52,
    ca:           base + 54,
    couchHost:    5984 + (n - 1) * 1000,
    ipfs:         5000 + n,
    swarm:        4000 + n,
    gateway:      8079 + n,
    clusterApi:   9094 + (n - 1) * 1000,
    clusterSwarm: 9096 + (n - 1) * 1000,
  };
}

function getOrgDomain(orgNum) {
  return `org${orgNum}.example.com`;
}

function getOrgNames(orgNum) {
  const org    = `Org${orgNum}`;
  const lower  = `org${orgNum}`;
  const mspId  = `${org}MSP`;
  const domain = getOrgDomain(orgNum);
  return { org, lower, mspId, domain };
}

module.exports = { getPorts, getOrgDomain, getOrgNames };
