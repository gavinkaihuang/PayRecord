import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { headers } from 'next/headers';
import { enrichBillsWithIcons, enrichBillWithIcons } from '@/lib/enrich';
import { logAction } from '@/lib/logger';

async function isAuthenticated() {
    const headersList = await headers();
    const authHeader = headersList.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    return await verifyToken(token);
}

// GET bills for a specific month
export async function GET(request: Request) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
                userId: user.userId as string,
                date: {
                    gte: startDate,
                    lte: endDate
                }
            },
            orderBy: {
                date: 'asc'
            }
        });

        const enrichedBills = await enrichBillsWithIcons(bills, user.userId as string);
        return NextResponse.json(enrichedBills);
    } catch (e) {
        return NextResponse.json({ error: 'Failed to fetch bills' }, { status: 500 });
    }
}

// Create a bill
export async function POST(request: Request) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        // Validation could be added here

        const bill = await prisma.bill.create({
            data: {
                userId: user.userId as string,
                date: new Date(body.date),
                payee: body.payee,
                payAmount: body.payAmount ? parseFloat(body.payAmount) : null,
                isPaid: body.isPaid || false,
                paidDate: body.paidDate ? new Date(body.paidDate) : null,
                payer: body.payer,
                receiveAmount: body.receiveAmount ? parseFloat(body.receiveAmount) : null,
                actualReceiveAmount: body.actualReceiveAmount ? parseFloat(body.actualReceiveAmount) : null,
                notes: body.notes,
                isRecurring: body.isRecurring || false,
            }
        });

        // Log Activity
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        await logAction(user.userId as string, 'CREATE_BILL', `Created bill for ${bill.payee || bill.payer || 'Unknown'}`, ip);

        const enrichedBill = await enrichBillWithIcons(bill, user.userId as string);
        return NextResponse.json(enrichedBill);
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to create bill' }, { status: 500 });
    }
}
// Bulk DELETE bills for a specific month
export async function DELETE(request: Request) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
                userId: user.userId as string,
                date: {
                    gte: startDate,
                    lte: endDate
                }
            }
        });

        // Log Activity
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        await logAction(user.userId as string, 'BULK_DELETE_BILLS', `Deleted ${result.count} bills for ${year}-${month}`, ip);

        return NextResponse.json({ deletedCount: result.count });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to delete bills' }, { status: 500 });
    }
}
