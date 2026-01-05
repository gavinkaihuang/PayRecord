const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const username = 'gavin';
    console.log(`Checking for user: ${username}`);

    const user = await prisma.user.findUnique({
        where: { username },
    });

    if (user) {
        console.log('User found:', user.username);
    } else {
        console.log('User NOT found');
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
