import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthUser, requireScope } from '@/lib/auth';
import { headers } from 'next/headers';
import { logAction } from '@/lib/logger';

export async function POST(request: Request) {
    const guard = await requireScope('write');
    if (guard) return guard;
    const user = await getAuthUser();

    const { year, month } = await request.json(); // Source year/month

    if (!year || !month) {
        return NextResponse.json({ error: 'Source year and month are required' }, { status: 400 });
    }

    try {
        const userId = user!.userId as string;

        // Determine target range (Next Month)
        // Date logic: Source is Y-M. Target is Y'-M'.
        const targetYear = month === 12 ? year + 1 : year;
        const targetMonth = month === 12 ? 1 : month + 1;

        const targetStartDate = new Date(targetYear, targetMonth - 1, 1);
        const targetEndDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

        // Fetch candidate recurring bills from the past 12 months up to the target start
        const pastWindowStart = new Date(targetYear, targetMonth - 1 - 12, 1);
        const pastRecurringBills = await prisma.bill.findMany({
            where: {
                userId,
                isRecurring: true,
                date: { gte: pastWindowStart, lt: targetStartDate }
            },
            orderBy: { date: 'desc' }
        });

        // Group past recurring bills by merchant key (payee or payer), keeping the most recent one
        const candidateBills: typeof pastRecurringBills = [];
        const seenKeys = new Set<string>();

        for (const bill of pastRecurringBills) {
            const key = bill.payee ? `payee:${bill.payee}` : bill.payer ? `payer:${bill.payer}` : `id:${bill.id}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);

            const billYear = bill.date.getFullYear();
            const billMonth = bill.date.getMonth() + 1;
            const diffMonths = (targetYear - billYear) * 12 + (targetMonth - billMonth);
            const interval = bill.recurringInterval && bill.recurringInterval > 0 ? bill.recurringInterval : 1;

            // Only clone if the month difference matches its recurring interval
            if (diffMonths === interval) {
                candidateBills.push(bill);
            }
        }

        const targetBills = await prisma.bill.findMany({
            where: {
                userId,
                date: { gte: targetStartDate, lte: targetEndDate }
            }
        });

        const billsToDelete: string[] = [];
        const billsToCreate: any[] = [];
        let skippedCount = 0;

        console.log(`Cloning to ${targetYear}-${targetMonth}. Found ${candidateBills.length} matched recurring bills.`);

        for (const bill of candidateBills) {
            // Keep day of month, clamped to the target month's maximum days
            const targetMaxDay = new Date(targetYear, targetMonth, 0).getDate();
            const targetDay = Math.min(bill.date.getDate(), targetMaxDay);
            const targetDate = new Date(
                targetYear,
                targetMonth - 1,
                targetDay,
                bill.date.getHours(),
                bill.date.getMinutes(),
                bill.date.getSeconds()
            );

            // Match Logic: Same Payee OR Same Payer in target month
            const existingBill = targetBills.find(b => {
                return b.payee === bill.payee && b.payer === bill.payer;
            });

            if (existingBill) {
                // Edited = Paid OR Received Amount set
                const isEdited = existingBill.isPaid || existingBill.actualReceiveAmount !== null;

                if (isEdited) {
                    skippedCount++;
                    continue;
                } else {
                    if (!billsToDelete.includes(existingBill.id)) {
                        billsToDelete.push(existingBill.id);
                    }
                }
            }

            // Prepare new bill data with recurringInterval preserved
            const billData = {
                userId,
                date: targetDate,
                payee: bill.payee,
                payAmount: null,
                payer: bill.payer,
                receiveAmount: null,
                notes: bill.notes,
                isRecurring: bill.isRecurring,
                recurringInterval: bill.recurringInterval || 1,
                includeInStats: bill.includeInStats,
                isPaid: false,
                paidDate: null,
                actualReceiveAmount: null
            };

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
                ip,
                user!.actor
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
