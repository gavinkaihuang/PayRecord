// Generate / rotate / remove a machine API key (X-API-Key) for a user.
//
// Usage:
//   node scripts/generate-api-key.js <username>            # generate or rotate
//   node scripts/generate-api-key.js <username> --remove   # revoke (clears hash)
//
// The plaintext key is printed ONCE and never stored; only its bcrypt hash
// is persisted in User.apiKeyHash. Regenerating overwrites the old key.

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

const prisma = new PrismaClient();

function generateKey() {
    // 32 random bytes, url-safe base64, prefixed for identification
    return 'prk_' + crypto.randomBytes(32).toString('base64url');
}

async function main() {
    const args = process.argv.slice(2);
    const remove = args.includes('--remove');
    const username = args.find(a => !a.startsWith('--'));

    if (!username) {
        console.error('Usage: node scripts/generate-api-key.js <username> [--remove]');
        process.exit(1);
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
        console.error(`User not found: ${username}`);
        process.exit(1);
    }

    if (remove) {
        await prisma.user.update({
            where: { id: user.id },
            data: { apiKeyHash: null }
        });
        console.log(`API key for "${username}" has been REVOKED.`);
        return;
    }

    const key = generateKey();
    const hash = await bcrypt.hash(key, 10);

    await prisma.user.update({
        where: { id: user.id },
        data: { apiKeyHash: hash }
    });

    console.log('API key generated for user:', username);
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
