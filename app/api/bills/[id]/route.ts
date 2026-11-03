import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthUser, requireScope } from '@/lib/auth';
import { headers } from 'next/headers';
import { enrichBillWithIcons } from '@/lib/enrich';
import { logAction } from '@/lib/logger';
import { parseAmount } from '@/lib/parse';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guard = await requireScope('write');
    if (guard) return guard;
    const user = await getAuthUser();
    const { id } = await params;

    try {
        const body = await request.json();
        const bill = await prisma.bill.update({
            where: {
                id: id,
                userId: user!.userId as string // Ensure ownership
            },
            data: {
                date: body.date ? new Date(body.date) : undefined,
                payee: body.payee,
                payAmount: body.payAmount !== undefined ? parseAmount(body.payAmount) : undefined,
                isPaid: body.isPaid,
                paidDate: body.paidDate ? new Date(body.paidDate) : (body.paidDate === null ? null : undefined),
                payer: body.payer,
                receiveAmount: body.receiveAmount !== undefined ? parseAmount(body.receiveAmount) : undefined,
                actualReceiveAmount: body.actualReceiveAmount !== undefined ? parseAmount(body.actualReceiveAmount) : undefined,
                notes: body.notes,
                isRecurring: body.isRecurring,
                recurringInterval: body.recurringInterval !== undefined ? parseInt(body.recurringInterval) : undefined,
                includeInStats: body.includeInStats !== undefined ? Boolean(body.includeInStats) : undefined,
            }
        });

        // Log Activity
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        await logAction(user!.userId as string, 'UPDATE_BILL', `Updated bill ${bill.id}`, ip, user!.actor);

        const enrichedBill = await enrichBillWithIcons(bill, user!.userId as string);
        return NextResponse.json(enrichedBill);
    } catch (e) {
        return NextResponse.json({ error: 'Failed to update bill' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guard = await requireScope('delete');
    if (guard) return guard;
    const user = await getAuthUser();
    const { id } = await params;

    try {
        await prisma.bill.delete({
            where: {
                id: id,
                userId: user!.userId as string
            }
        });

        // Log Activity
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        await logAction(user!.userId as string, 'DELETE_BILL', `Deleted bill ${id}`, ip, user!.actor);

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Failed to delete bill' }, { status: 500 });
    }
}
