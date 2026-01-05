const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    console.log('Updating admin password...');
    const password = await bcrypt.hash('gavinhuang', 10);
    
    try {
        const user = await prisma.user.update({
            where: { username: 'admin' },
            data: {
                password,
            },
        });
        console.log('Successfully updated admin password for user:', user.username);
    } catch (error) {
        if (error.code === 'P2025') {
            console.error('Error: User "admin" not found.');
        } else {
            console.error('Error updating password:', error);
        }
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
