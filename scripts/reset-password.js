const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error('Usage: node scripts/reset-password.js <username>');
        process.exit(1);
    }

    const username = args[0];
    const newPasswordRaw = `${username}123`;

    console.log(`Resetting password for user: ${username}`);
    console.log(`New password will be: ${newPasswordRaw}`);

    const user = await prisma.user.findUnique({
        where: { username }
    });

    if (!user) {
        console.error(`Error: User '${username}' not found.`);
        process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(newPasswordRaw, 10);

    await prisma.user.update({
        where: { username },
        data: { password: hashedPassword }
    });

    console.log('Password updated successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
