'use strict';

const { Contract } = require('fabric-contract-api');

// Deterministic timestamp from the Fabric transaction header (same on all peers)
function txTimestamp(ctx) {
    const t = ctx.stub.getTxTimestamp();
    return new Date(Number(t.seconds) * 1000 + Math.floor(t.nanos / 1e6)).toISOString();
}

class BackupContract extends Contract {

    async initLedger(ctx) {
        console.info('=== backup-cc initialisé ===');
    }

    // ─── Audit interne ────────────────────────────────────────────────────────

    async _recordAudit(ctx, action, target, details) {
        const ts = txTimestamp(ctx);
        const txId = ctx.stub.getTxID();
        const actor = ctx.clientIdentity.getID();
        const key = `audit_${ts}_${txId}`;
        const entry = { action, target, details, actor, timestamp: ts, txId };
        await ctx.stub.putState(key, Buffer.from(JSON.stringify(entry)));
    }

    async recordAuditEntry(ctx, action, target, detailsJson) {
        const details = detailsJson ? JSON.parse(detailsJson) : {};
        await this._recordAudit(ctx, action, target, details);
        return JSON.stringify({ recorded: true });
    }

    async getAuditHistory(ctx, filtersJson) {
        const filters = filtersJson ? JSON.parse(filtersJson) : {};
        const iterator = await ctx.stub.getStateByRange('audit_', 'audit_~');
        const results = [];
        let res = await iterator.next();
        while (!res.done) {
            try {
                const entry = JSON.parse(res.value.value.toString());
                if (filters.action && entry.action !== filters.action) { res = await iterator.next(); continue; }
                if (filters.target && entry.target !== filters.target) { res = await iterator.next(); continue; }
                if (filters.actor && !entry.actor.includes(filters.actor)) { res = await iterator.next(); continue; }
                if (filters.dateFrom && entry.timestamp < filters.dateFrom) { res = await iterator.next(); continue; }
                if (filters.dateTo && entry.timestamp > filters.dateTo) { res = await iterator.next(); continue; }
                results.push(entry);
            } catch (_) { /* skip malformed */ }
            res = await iterator.next();
        }
        await iterator.close();
        results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        return JSON.stringify(results);
    }

    // ─── Sauvegardes ─────────────────────────────────────────────────────────

    async registerBackup(ctx, backupId, cid, fileName, fileHash, fileSize, mimeType) {
        const existing = await ctx.stub.getState(backupId);
        if (existing && existing.length > 0) {
            throw new Error(`La sauvegarde ${backupId} existe déjà`);
        }

        const ownerId = ctx.clientIdentity.getID();
        const ownerMSP = ctx.clientIdentity.getMSPID();

        const entry = {
            backupId, cid, fileName, fileHash,
            fileSize: parseInt(fileSize, 10),
            mimeType, ownerId, ownerMSP,
            timestamp: txTimestamp(ctx),
            txId: ctx.stub.getTxID(),
            status: 'ACTIVE',
            source: 'LOCAL',
            sourceDetails: {},
            sharedWith: [],
            verificationCount: 0,
            lastVerification: null,
        };

        await ctx.stub.putState(backupId, Buffer.from(JSON.stringify(entry)));
        await this._recordAudit(ctx, 'BACKUP_REGISTERED', backupId, { cid, fileName, fileSize: entry.fileSize });

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
        await this._recordAudit(ctx, 'BACKUP_READ', backupId, {});
        return data.toString();
    }

    async getAllBackups(ctx) {
        const iterator = await ctx.stub.getStateByRange('', '');
        const results = [];
        let res = await iterator.next();
        while (!res.done) {
            const val = res.value.value.toString();
            try {
                const parsed = JSON.parse(val);
                if (parsed.backupId) results.push(parsed);
            } catch (_) { /* skip */ }
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
            timestamp: txTimestamp(ctx),
            verifier: ctx.clientIdentity.getID(),
            result: valid,
        };
        await ctx.stub.putState(backupId, Buffer.from(JSON.stringify(entry)));
        await this._recordAudit(ctx, 'INTEGRITY_VERIFIED', backupId, { valid, providedHash });

        ctx.stub.setEvent('IntegrityVerified', Buffer.from(JSON.stringify({
            backupId, result: valid, verifier: ctx.clientIdentity.getID(),
        })));

        return JSON.stringify({ backupId, valid });
    }

    async getBackupsByOwner(ctx) {
        const ownerId = ctx.clientIdentity.getID();
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
