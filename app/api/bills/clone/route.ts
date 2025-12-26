import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { headers } from 'next/headers';

async function isAuthenticated() {
    const headersList = await headers();
    const authHeader = headersList.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    return await verifyToken(token);
}

export async function POST(request: Request) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { year, month } = await request.json(); // Source year/month

    if (!year || !month) {
        return NextResponse.json({ error: 'Source year and month are required' }, { status: 400 });
    }

    try {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        // Fetch source bills
        const sourceBills = await prisma.bill.findMany({
            where: {
                userId: user.userId as string,
                date: { gte: startDate, lte: endDate }
            }
        });

        const newBills = [];

        for (const bill of sourceBills) {
            // Calculate next month date
            // Handle edge case: next month might not have same day (e.g. Jan 31 -> Feb 28/29?)
            // User requirement: "2025-12-25" -> "2026-01-25".
            // Standard JS Date behavior: setMonth(month + 1). If overflow, it rolls over.
            // But usually for bills 'same day' means literally same number unless invalid.
            // Let's use simple logic:

            let targetDate = new Date(bill.date);
            targetDate.setMonth(targetDate.getMonth() + 1);

            // Logic A: Recurring = Yes
            // Copy: date (shifted), payee, payAmount, payer, receiveAmount, notes, isRecurring.
            // Logic B: Recurring = No
            // Copy: date (shifted), payee, payer, receiveAmount, notes, isRecurring.
            // (Exclude payAmount)

            // Note: Receive Amount is copied in BOTH cases per instructions.

            const commonData = {
                userId: user.userId as string,
                date: targetDate,
                payee: bill.payee,
                payer: bill.payer,
                receiveAmount: bill.receiveAmount,
                notes: bill.notes,
                isRecurring: bill.isRecurring,
                // Reset status fields
                isPaid: false,
                paidDate: null,
                actualReceiveAmount: null
            };

            const billData = {
                ...commonData,
                payAmount: bill.isRecurring ? bill.payAmount : null,
            };

            newBills.push(billData);
        }

        if (newBills.length > 0) {
            await prisma.bill.createMany({
                data: newBills
            });
        }

        return NextResponse.json({ clonedCount: newBills.length });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to clone bills' }, { status: 500 });
    }
}
