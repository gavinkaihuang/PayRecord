
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

async function main() {
    console.log('Starting verification...');

    const username = `testuser_${Date.now()}`;
    const password = 'password123';
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log(`Creating test user: ${username}`);
    const user = await prisma.user.create({
        data: {
            username,
            password: hashedPassword,
        }
    });

    try {
        // 1. Login
        console.log('\nTesting Login...');
        const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log('✅ Login successful, got token.');

        // 2. Create Bill
        console.log('\nTesting Create Bill...');
        const createRes = await fetch(`${BASE_URL}/api/bills`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                date: new Date().toISOString(),
                payee: 'Test Payee',
                payAmount: 100,
                notes: 'Test Bill'
            })
        });

        if (!createRes.ok) throw new Error(`Create Bill failed: ${createRes.status} ${await createRes.text()}`);
        const bill = await createRes.json();
        console.log(`✅ Bill created: ${bill.id}`);

        // 3. Get Bills (Default month)
        console.log('\nTesting Get Bills (Default Params)...');
        const getRes = await fetch(`${BASE_URL}/api/bills`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!getRes.ok) throw new Error(`Get Bills failed: ${getRes.status} ${await getRes.text()}`);
        const bills = await getRes.json();
        const found = bills.find((b: any) => b.id === bill.id);
        if (found) {
            console.log(`✅ Found created bill in list. Total bills: ${bills.length}`);
        } else {
            console.error('❌ Bill not found in list!', bills);
        }

        // 4. Edit Bill
        console.log('\nTesting Edit Bill...');
        const editRes = await fetch(`${BASE_URL}/api/bills/${bill.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                isPaid: true,
                payAmount: 150
            })
        });

        if (!editRes.ok) throw new Error(`Edit Bill failed: ${editRes.status} ${await editRes.text()}`);
        const updatedBill = await editRes.json();
        if (updatedBill.isPaid === true && updatedBill.payAmount === 150) {
            console.log('✅ Bill updated successfully.');
        } else {
            console.error('❌ Bill update verification failed:', updatedBill);
        }

    } catch (err) {
        console.error('Verification failed:', err);
    } finally {
        // Cleanup
        console.log('\nCleaning up...');
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.$disconnect();
    }
}

main();
