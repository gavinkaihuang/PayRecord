
const { PrismaClient } = require('@prisma/client');
const ical = require('ical-generator').default; // Check if .default is needed based on import
const { startOfMonth } = require('date-fns');

const prisma = new PrismaClient();

async function main() {
    console.log('--- Starting ICS Verification ---');

    // 1. Get a user
    const user = await prisma.user.findFirst();
    if (!user) {
        console.error('No user found');
        return;
    }
    console.log(`Using User: ${user.username} (${user.id})`);

    // 2. Ensure a bill exists for this month
    const startOfCurrentMonth = startOfMonth(new Date());

    // Clean up previous test bills if needed, or just create a new one
    const billUnpaid = await prisma.bill.create({
        data: {
            userId: user.id,
            date: new Date(),
            payee: 'Test Payee Unpaid',
            payAmount: 100.00,
            isPaid: false,
            notes: 'Test Note Unpaid',
        },
    });

    const billPaid = await prisma.bill.create({
        data: {
            userId: user.id,
            date: new Date(),
            payee: 'Test Payee Paid',
            payAmount: 200.00,
            isPaid: true,
            notes: 'Test Note Paid',
        },
    });

    console.log(`Created test bills: ${billUnpaid.id}, ${billPaid.id}`);

    // 3. Simulate Logic
    const bills = await prisma.bill.findMany({
        where: {
            userId: user.id,
            date: {
                gte: startOfCurrentMonth,
            },
        },
        orderBy: {
            date: 'asc',
        },
    });

    console.log(`Found ${bills.length} bills for this month.`);

    const calendar = ical({
        name: 'PayRecord Bills',
        timezone: 'Asia/Shanghai',
    });

    bills.forEach((b) => {
        const statusIcon = b.isPaid ? '✅' : '⭕';
        const statusText = b.isPaid ? 'Paid' : 'Unpaid';
        calendar.createEvent({
            start: b.date,
            allDay: true,
            summary: `${statusIcon} Pay: ${b.payee || 'Unknown'} - ${b.payAmount || 0}`,
            description: `Status: ${statusText}\nAmount: ${b.payAmount || 0}\nNotes: ${b.notes || ''}`,
        });
    });

    const output = calendar.toString();
    console.log('--- ICS Output Preview ---');
    console.log(output.substring(0, 1000));

    if (output.includes('✅') && output.includes('⭕')) {
        console.log('SUCCESS: ICS content generated correctly with status icons.');
    } else {
        console.error('FAILURE: ICS content missing status icons.');
    }

    // Cleanup
    await prisma.bill.deleteMany({ where: { id: { in: [billUnpaid.id, billPaid.id] } } });
    console.log('Cleaned up test bills.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
