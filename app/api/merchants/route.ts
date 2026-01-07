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
// 1. Get explicitly saved merchants (Global)
// 2. Get distinct payees/payers from bills (User specific context is still relevant for discovery, but icons are global)
// 3. Merge them, prioritizing explicitly saved icons
export async function GET(request: Request) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const userId = user.userId as string;

        // 1. Fetch ALL saved merchants (Global)
        const savedMerchants = await prisma.merchant.findMany({
            orderBy: { name: 'asc' }
        });

        // 2. Fetch distinct payees and payers from bills (To find what merchants THIS user interacts with)
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

        // Add from bills first (default no icon - unless we find a global match later)
        billMerchants.forEach(name => {
            result.set(name, { name, icon: null });
        });

        // Override/Add with saved merchants (Global)
        // If a saved merchant exists, use its icon.
        // We include ALL saved merchants, or just the ones relevant to the user? 
        // Requirement: "Merchant Icons are global". So arguably showing all available global icons is fine, or we filter.
        // Let's show existing bill merchants + all configured global merchants.
        savedMerchants.forEach(m => {
            result.set(m.name, { name: m.name, icon: m.icon });
        });

        return NextResponse.json(Array.from(result.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to fetch merchants' }, { status: 500 });
    }
}

// POST: Create or Update a Merchant (Set Icon) - Global
export async function POST(request: Request) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { name, icon } = await request.json();
        if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

        const merchant = await prisma.merchant.upsert({
            where: {
                name: name
            },
            update: { icon },
            create: {
                name,
                icon
            }
        });

        // Log Activity
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        await logAction(user.userId as string, 'UPDATE_MERCHANT_ICON', `Updated global icon for ${merchant.name}`, ip);

        return NextResponse.json(merchant);
    } catch (e: any) {
        console.error('Merchant save error:', e);
        return NextResponse.json({ error: 'Failed to save merchant', details: e.message }, { status: 500 });
    }
}

// DELETE: Remove a Merchant configuration (reset icon) - Global
export async function DELETE(request: Request) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { searchParams } = new URL(request.url);
        const name = searchParams.get('name');

        if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

        await prisma.merchant.delete({
            where: {
                name: name
            }
        });

        // Log Activity
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        await logAction(user.userId as string, 'DELETE_MERCHANT', `Deleted global merchant config for ${name}`, ip);

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Merchant delete error:', e);
        return NextResponse.json({ error: 'Failed to delete merchant' }, { status: 500 });
    }
}
