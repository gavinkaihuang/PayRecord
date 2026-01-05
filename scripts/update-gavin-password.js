const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    console.log('Updating password for user: gavin');
    const password = await bcrypt.hash('gavinhuang', 10);

    try {
        const user = await prisma.user.update({
            where: { username: 'gavin' },
            data: {
                password,
            },
        });
        console.log('Successfully updated password for user:', user.username);
    } catch (error) {
        console.error('Error updating password:', error);
    }
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
