import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthUser, requireScope } from '@/lib/auth';


export async function GET(request: Request) {
    const guard = await requireScope('read');
    if (guard) return guard;
    const user = await getAuthUser();

    try {
        const logs = await prisma.log.findMany({
            where: { userId: user!.userId as string },
            orderBy: { createdAt: 'desc' },
            take: 100 // Limit to last 100 logs
        });
        return NextResponse.json(logs);
    } catch (e) {
        return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }
}
