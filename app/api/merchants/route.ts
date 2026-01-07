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

// GET: Fetch all unique merchants (Payees + Payers)
// 1. Get explicitly saved merchants
// 2. Get distinct payees/payers from bills
// 3. Merge them, prioritizing explicitly saved icons
export async function GET(request: Request) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const userId = user.userId as string;

        // 1. Fetch saved merchants
        const savedMerchants = await prisma.merchant.findMany({
            where: { userId },
            orderBy: { name: 'asc' }
        });

        // 2. Fetch distinct payees and payers from bills
        const bills = await prisma.bill.findMany({
            where: { userId },
            select: { payee: true, payer: true }
        });

        const billMerchants = new Set<string>();
        bills.forEach(bill => {
            if (bill.payee) billMerchants.add(bill.payee);
            if (bill.payer) billMerchants.add(bill.payer);
        });

        // 3. Merge
        const result = new Map<string, { name: string, icon: string | null }>();

        // Add from bills first (default no icon)
        billMerchants.forEach(name => {
            result.set(name, { name, icon: null });
        });

        // Override with saved merchants (has icon)
        savedMerchants.forEach(m => {
            result.set(m.name, { name: m.name, icon: m.icon });
        });

        return NextResponse.json(Array.from(result.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to fetch merchants' }, { status: 500 });
    }
}

// POST: Create or Update a Merchant (Set Icon)
export async function POST(request: Request) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { name, icon } = await request.json();
        if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

        const merchant = await prisma.merchant.upsert({
            where: {
                userId_name: {
                    userId: user.userId as string,
                    name: name
                }
            },
            update: { icon },
            create: {
                userId: user.userId as string,
                name,
                icon
            }
        });

        // Log Activity
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        await logAction(user.userId as string, 'UPDATE_MERCHANT_ICON', `Updated icon for ${merchant.name}`, ip);

        return NextResponse.json(merchant);
    } catch (e: any) {
        console.error('Merchant save error:', e);
        console.error('Error code:', e.code);
        console.error('Error meta:', e.meta);
        return NextResponse.json({ error: 'Failed to save merchant', details: e.message }, { status: 500 });
    }
}

// DELETE: Remove a Merchant configuration (reset icon)
export async function DELETE(request: Request) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { searchParams } = new URL(request.url);
        const name = searchParams.get('name');

        if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

        await prisma.merchant.deleteMany({
            where: {
                userId: user.userId as string,
                name: name
            }
        });

        // Log Activity
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        await logAction(user.userId as string, 'DELETE_MERCHANT', `Deleted merchant config for ${name}`, ip);

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Merchant delete error:', e);
        return NextResponse.json({ error: 'Failed to delete merchant' }, { status: 500 });
    }
}
