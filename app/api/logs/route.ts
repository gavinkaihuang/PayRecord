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

export async function GET(request: Request) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const logs = await prisma.log.findMany({
            where: { userId: user.userId as string },
            orderBy: { createdAt: 'desc' },
            take: 100 // Limit to last 100 logs
        });
        return NextResponse.json(logs);
    } catch (e) {
        return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }
}
