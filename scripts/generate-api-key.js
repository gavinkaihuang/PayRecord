// Manage machine API keys (X-API-Key) for a user - multi-key edition.
//
// Usage:
//   node scripts/generate-api-key.js <username> --name <keyName> [--scopes read,write,delete]
//                                   # create or rotate the named key
//   node scripts/generate-api-key.js <username> --list
//                                   # list keys (name, scopes, lastUsed, revoked)
//   node scripts/generate-api-key.js <username> --revoke <keyName>
//                                   # revoke by name (key stops working immediately)
//
// Examples:
//   node scripts/generate-api-key.js gavin --name hermes               # full access
//   node scripts/generate-api-key.js gavin --name muse --scopes read,write   # no delete
//
// The plaintext key is printed ONCE and never stored; only its bcrypt hash
// is persisted in the ApiKey table. Regenerating a name rotates that key.
// Legacy note: pre-multi-key User.apiKeyHash values keep working and are
// auto-migrated to an ApiKey row named "legacy" on first use.

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

const prisma = new PrismaClient();

const VALID_SCOPES = ['read', 'write', 'delete'];

function generateKey() {
    // 32 random bytes, url-safe base64, prefixed for identification
    return 'prk_' + crypto.randomBytes(32).toString('base64url');
}

function usage() {
    console.error(`Usage:
  node scripts/generate-api-key.js <username> --name <keyName> [--scopes read,write,delete]
  node scripts/generate-api-key.js <username> --list
  node scripts/generate-api-key.js <username> --revoke <keyName>`);
    process.exit(1);
}

async function main() {
    const args = process.argv.slice(2);
    const username = args.find(a => !a.startsWith('--'));
    const wantList = args.includes('--list');

    const valOf = (flag) => {
        const i = args.indexOf(flag);
        return i >= 0 ? args[i + 1] : undefined;
    };
    const name = valOf('--name');
    const revoke = valOf('--revoke');
    let scopes = valOf('--scopes') || 'read,write,delete';

    if (!username) usage();

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
        console.error(`User not found: ${username}`);
        process.exit(1);
    }

    if (wantList) {
        const keys = await prisma.apiKey.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'asc' }
        });
        if (keys.length === 0) {
            console.log(`No API keys for "${username}" (legacy single key may exist in User.apiKeyHash).`);
        }
        for (const k of keys) {
            const status = k.revokedAt ? `REVOKED ${k.revokedAt.toISOString().slice(0, 10)}` : 'active';
            const used = k.lastUsedAt ? k.lastUsedAt.toISOString().replace('T', ' ').slice(0, 16) : 'never';
            console.log(`${k.name.padEnd(12)} scopes=${k.scopes.padEnd(18)} lastUsed=${used.padEnd(17)} ${status}`);
        }
        return;
    }

    if (revoke) {
        const row = await prisma.apiKey.findUnique({
            where: { userId_name: { userId: user.id, name: revoke } }
        });
        if (!row) {
            console.error(`Key not found: "${revoke}" (run --list to see names)`);
            process.exit(1);
        }
        await prisma.apiKey.update({
            where: { id: row.id },
            data: { revokedAt: new Date() }
        });
        console.log(`Key "${revoke}" for "${username}" has been REVOKED (stops working immediately).`);
        return;
    }

    if (!name) usage();

    const scopeList = scopes.split(',').map(s => s.trim()).filter(Boolean);
    const bad = scopeList.filter(s => !VALID_SCOPES.includes(s));
    if (bad.length || scopeList.length === 0) {
        console.error(`Invalid scopes: ${bad.join(', ')}. Valid: ${VALID_SCOPES.join(',')}`);
        process.exit(1);
    }
    scopes = [...new Set(scopeList)].join(',');

    const key = generateKey();
    const hash = await bcrypt.hash(key, 10);

    // upsert by (userId, name): creating an existing name rotates it
    await prisma.apiKey.upsert({
        where: { userId_name: { userId: user.id, name } },
        update: { keyHash: hash, scopes, revokedAt: null },
        create: { userId: user.id, name, keyHash: hash, scopes }
    });

    console.log(`API key "${name}" generated for user "${username}" (scopes: ${scopes}).`);
    console.log('Save it now - it will NOT be shown again:\n');
    console.log(key);
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
