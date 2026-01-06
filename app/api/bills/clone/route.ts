import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { headers } from 'next/headers';
import { logAction } from '@/lib/logger';

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
        const userId = user.userId as string;
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        // Fetch source bills
        const sourceBills = await prisma.bill.findMany({
            where: {
                userId,
                date: { gte: startDate, lte: endDate }
            }
        });

        // Determine target range (Next Month)
        // We need to fetch ALL bills in target month to check for existence
        // Date logic: Source is Y-M. Target is Y'-M'.
        // We assume target is exactly +1 month.
        const targetYear = month === 12 ? year + 1 : year;
        const targetMonth = month === 12 ? 1 : month + 1;

        const targetStartDate = new Date(targetYear, targetMonth - 1, 1);
        const targetEndDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

        const targetBills = await prisma.bill.findMany({
            where: {
                userId,
                date: { gte: targetStartDate, lte: targetEndDate }
            }
        });

        const billsToDelete: string[] = [];
        const billsToCreate: any[] = [];
        let skippedCount = 0;

        console.log(`Cloning from ${year}-${month}. Found ${sourceBills.length} source bills.`);

        for (const bill of sourceBills) {
            // Only clone recurring bills
            if (!bill.isRecurring) continue;

            // Skip bills with custom intervals (client-side logic handles fetching these)
            if (bill.recurringInterval && bill.recurringInterval > 1) continue;

            console.log('Processing Source Bill:', {
                id: bill.id,
                payee: bill.payee,
                payAmount: bill.payAmount,
                isRecurring: bill.isRecurring
            });

            // Calculate target date for this specific bill
            let targetDate = new Date(bill.date);
            targetDate.setMonth(targetDate.getMonth() + 1);

            // Match Logic: Same Payee OR Same Payer
            // (Bills usually have either payee or payer. If both, match both.)
            // We look for a bill in target month with same payee/payer.
            const existingBill = targetBills.find(b => {
                const samePayee = bill.payee ? b.payee === bill.payee : true; // If source has payee, target must match.
                const samePayer = bill.payer ? b.payer === bill.payer : true;
                // Ensure at least one matches and neither mismatches if present
                // Simplify: just check equality of fields
                return b.payee === bill.payee && b.payer === bill.payer;
            });

            if (existingBill) {
                // Check if edited
                // Edited = Paid OR Received Amount set
                const isEdited = existingBill.isPaid || existingBill.actualReceiveAmount !== null;

                if (isEdited) {
                    skippedCount++;
                    continue;
                } else {
                    // Exists but not edited -> Delete old, add new
                    if (!billsToDelete.includes(existingBill.id)) {
                        billsToDelete.push(existingBill.id);
                    }
                    // Proceed to add to create list
                }
            }

            // Prepare new bill data
            const commonData = {
                userId,
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
                payAmount: bill.payAmount,
            };

            console.log('Created Bill Data:', billData);
            billsToCreate.push(billData);
        }

        // Execute Transaction
        const operations = [];
        if (billsToDelete.length > 0) {
            operations.push(prisma.bill.deleteMany({
                where: { id: { in: billsToDelete } }
            }));
        }
        if (billsToCreate.length > 0) {
            operations.push(prisma.bill.createMany({
                data: billsToCreate
            }));
        }

        if (operations.length > 0) {
            await prisma.$transaction(operations);

            // Log Activity (Only if we did something)
            const headersList = await headers();
            const ip = headersList.get('x-forwarded-for') || 'unknown';
            await logAction(
                userId,
                'CLONE_BILLS',
                `Cloned ${billsToCreate.length} bills from ${year}-${month}. Deleted ${billsToDelete.length} unedited. Skipped ${skippedCount}.`,
                ip
            );
        }

        return NextResponse.json({
            clonedCount: billsToCreate.length,
            deletedCount: billsToDelete.length,
            skippedCount
        });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to clone bills' }, { status: 500 });
    }
}
