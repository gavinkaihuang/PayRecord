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

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    try {
        const body = await request.json();
        const bill = await prisma.bill.update({
            where: {
                id: id,
                userId: user.userId as string // Ensure ownership
            },
            data: {
                date: body.date ? new Date(body.date) : undefined,
                payee: body.payee,
                payAmount: body.payAmount !== undefined ? (body.payAmount ? parseFloat(body.payAmount) : null) : undefined,
                isPaid: body.isPaid,
                paidDate: body.paidDate ? new Date(body.paidDate) : (body.paidDate === null ? null : undefined),
                payer: body.payer,
                receiveAmount: body.receiveAmount !== undefined ? (body.receiveAmount ? parseFloat(body.receiveAmount) : null) : undefined,
                actualReceiveAmount: body.actualReceiveAmount !== undefined ? (body.actualReceiveAmount ? parseFloat(body.actualReceiveAmount) : null) : undefined,
                notes: body.notes,
                isRecurring: body.isRecurring,
            }
        });
        return NextResponse.json(bill);
    } catch (e) {
        return NextResponse.json({ error: 'Failed to update bill' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    try {
        await prisma.bill.delete({
            where: {
                id: id,
                userId: user.userId as string
            }
        });
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Failed to delete bill' }, { status: 500 });
    }
}
