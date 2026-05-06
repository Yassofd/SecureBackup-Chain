'use strict';

const { Contract } = require('fabric-contract-api');

class BackupContract extends Contract {

    async initLedger(ctx) {
        console.info('=== backup-cc initialisé ===');
    }

    async registerBackup(ctx, backupId, cid, fileName, fileHash, fileSize, mimeType) {
        const existing = await ctx.stub.getState(backupId);
        if (existing && existing.length > 0) {
            throw new Error(`La sauvegarde ${backupId} existe déjà`);
        }

        const ownerId = ctx.clientIdentity.getID();
        const ownerMSP = ctx.clientIdentity.getMSPID();

        const entry = {
            backupId,
            cid,
            fileName,
            fileHash,
            fileSize: parseInt(fileSize, 10),
            mimeType,
            ownerId,
            ownerMSP,
            timestamp: new Date().toISOString(),
            txId: ctx.stub.getTxID(),
            status: 'ACTIVE',
            source: 'LOCAL',
            sourceDetails: {},
            sharedWith: [],
            verificationCount: 0,
            lastVerification: null,
        };

        await ctx.stub.putState(backupId, Buffer.from(JSON.stringify(entry)));

        ctx.stub.setEvent('BackupRegistered', Buffer.from(JSON.stringify({
            backupId, cid, fileName, ownerId, ownerMSP,
        })));

        return JSON.stringify(entry);
    }

    async getBackup(ctx, backupId) {
        const data = await ctx.stub.getState(backupId);
        if (!data || data.length === 0) {
            throw new Error(`Sauvegarde ${backupId} introuvable`);
        }
        return data.toString();
    }

    async getAllBackups(ctx) {
        const iterator = await ctx.stub.getStateByRange('', '');
        const results = [];
        let res = await iterator.next();
        while (!res.done) {
            const val = res.value.value.toString();
            try {
                results.push(JSON.parse(val));
            } catch (_) {
                results.push(val);
            }
            res = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(results);
    }

    async verifyIntegrity(ctx, backupId, providedHash) {
        const data = await ctx.stub.getState(backupId);
        if (!data || data.length === 0) {
            throw new Error(`Sauvegarde ${backupId} introuvable`);
        }
        const entry = JSON.parse(data.toString());
        const valid = entry.fileHash === providedHash;

        entry.verificationCount += 1;
        entry.lastVerification = {
            timestamp: new Date().toISOString(),
            verifier: ctx.clientIdentity.getID(),
            result: valid,
        };
        await ctx.stub.putState(backupId, Buffer.from(JSON.stringify(entry)));

        ctx.stub.setEvent('IntegrityVerified', Buffer.from(JSON.stringify({
            backupId, result: valid, verifier: ctx.clientIdentity.getID(),
        })));

        return JSON.stringify({ backupId, valid });
    }

    async getBackupsByOwner(ctx) {
        const ownerId = ctx.clientIdentity.getID();
        // CouchDB rich query pour filtrer par ownerId
        const query = JSON.stringify({ selector: { ownerId } });
        const iterator = await ctx.stub.getQueryResult(query);
        const results = [];
        let res = await iterator.next();
        while (!res.done) {
            try {
                results.push(JSON.parse(res.value.value.toString()));
            } catch (_) {
                results.push(res.value.value.toString());
            }
            res = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(results);
    }
}

module.exports = BackupContract;
