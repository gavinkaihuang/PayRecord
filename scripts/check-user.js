const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { username: 'gavin' },
        select: {
            username: true,
            telegramToken: true,
            telegramChatId: true
        }
    });
    console.log('User Data in DB:', user);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
