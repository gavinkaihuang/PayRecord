import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthUser, requireScope } from '@/lib/auth';
import { headers } from 'next/headers';
import { enrichBillsWithIcons, enrichBillWithIcons } from '@/lib/enrich';
import { logAction } from '@/lib/logger';
import { parseAmount } from '@/lib/parse';

// GET bills for a specific month
export async function GET(request: Request) {
    const guard = await requireScope('read');
    if (guard) return guard;
    const user = await getAuthUser();

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = parseInt(searchParams.get('year') || now.getFullYear().toString());
    const month = parseInt(searchParams.get('month') || (now.getMonth() + 1).toString());

    if (isNaN(year) || isNaN(month)) {
        return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 });
    }

    try {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59); // Last day of month

        const bills = await prisma.bill.findMany({
            where: {
                userId: user!.userId as string,
                date: {
                    gte: startDate,
                    lte: endDate
                }
            },
            orderBy: {
                date: 'asc'
            }
        });

        const enrichedBills = await enrichBillsWithIcons(bills);
        return NextResponse.json(enrichedBills);
    } catch (e) {
        return NextResponse.json({ error: 'Failed to fetch bills' }, { status: 500 });
    }
}

// Create a bill
export async function POST(request: Request) {
    const guard = await requireScope('write');
    if (guard) return guard;
    const user = await getAuthUser();

    try {
        const body = await request.json();
        // Validation could be added here

        // Idempotency for machine writers: when dedupeKey is provided and a
        // bill with that key already exists, return it with duplicated:true
        // instead of creating a second copy. Agents retrying or replaying the
        // same logical transaction must not double-record.
        if (body.dedupeKey) {
            const existing = await prisma.bill.findUnique({
                where: { dedupeKey: String(body.dedupeKey) }
            });
            if (existing) {
                const enriched = await enrichBillWithIcons(existing);
                return NextResponse.json({ ...enriched, duplicated: true });
            }
        }

        const bill = await prisma.bill.create({
            data: {
                userId: user!.userId as string,
                date: new Date(body.date),
                payee: body.payee,
                payAmount: parseAmount(body.payAmount),
                isPaid: body.isPaid || false,
                paidDate: body.paidDate ? new Date(body.paidDate) : null,
                payer: body.payer,
                receiveAmount: parseAmount(body.receiveAmount),
                actualReceiveAmount: parseAmount(body.actualReceiveAmount),
                notes: body.notes,
                dedupeKey: body.dedupeKey ? String(body.dedupeKey) : null,
                isRecurring: body.isRecurring || false,
                recurringInterval: body.recurringInterval ? parseInt(body.recurringInterval) : 1,
                includeInStats: body.includeInStats !== undefined ? Boolean(body.includeInStats) : true,
            }
        });

        // Log Activity
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        await logAction(user!.userId as string, 'CREATE_BILL', `Created bill for ${bill.payee || bill.payer || 'Unknown'}`, ip, user!.actor);

        const enrichedBill = await enrichBillWithIcons(bill);
        return NextResponse.json(enrichedBill);
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to create bill' }, { status: 500 });
    }
}

// Bulk DELETE bills for a specific month
export async function DELETE(request: Request) {
    const guard = await requireScope('delete');
    if (guard) return guard;
    const user = await getAuthUser();

    const { searchParams } = new URL(request.url);
    const yearStr = searchParams.get('year');
    const monthStr = searchParams.get('month');

    if (!yearStr || !monthStr) {
        return NextResponse.json({ error: 'Year and month are required' }, { status: 400 });
    }

    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    if (isNaN(year) || isNaN(month)) {
        return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 });
    }

    try {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const result = await prisma.bill.deleteMany({
            where: {
                userId: user!.userId as string,
                date: {
                    gte: startDate,
                    lte: endDate
                }
            }
        });

        // Log Activity
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        await logAction(user!.userId as string, 'BULK_DELETE_BILLS', `Deleted ${result.count} bills for ${year}-${month}`, ip, user!.actor);

        return NextResponse.json({ deletedCount: result.count });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to delete bills' }, { status: 500 });
    }
}
