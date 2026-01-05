const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const username = 'admin';
    const password = 'gavinhuang';

    console.log(`Testing login for user: ${username} with password: ${password}`);

    const user = await prisma.user.findUnique({
        where: { username },
    });

    if (!user) {
        console.error('User not found');
        return;
    }

    console.log('User found:', user.username);
    console.log('Stored hash:', user.password);

    const isValid = await bcrypt.compare(password, user.password);
    console.log('Password valid:', isValid);
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
