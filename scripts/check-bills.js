const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany();
    console.log('Users:', users.map(u => ({ id: u.id, username: u.username })));

    const bills = await prisma.bill.findMany({
        include: { user: true }
    });
    console.log('Bills:', bills.map(b => ({
        id: b.id,
        user: b.user.username,
        date: b.date,
        payee: b.payee,
        amount: b.payAmount
    })));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
