const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const users = [
        {
            username: 'admin',
            nickname: '管理员',
            password: 'admin123'
        },
        {
            username: 'gavin',
            nickname: '普通用户',
            password: 'gavin123'
        }
    ];

    console.log('Seeding database...');

    for (const user of users) {
        const hashedPassword = await bcrypt.hash(user.password, 10);

        const upsertedUser = await prisma.user.upsert({
            where: { username: user.username },
            update: {
                password: hashedPassword,
                nickname: user.nickname
            },
            create: {
                username: user.username,
                password: hashedPassword,
                nickname: user.nickname
            }
        });

        console.log(`User created/updated: ${upsertedUser.username} (${upsertedUser.nickname})`);
    }

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
