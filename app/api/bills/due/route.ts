import { NextResponse } from 'next/server';
import { getAuthUser, requireScope } from '@/lib/auth';
import { getDueBills } from '@/lib/due';
import { parseDueDays } from '@/lib/parse';

// GET /api/bills/due?days=N&includeInStats=true|false
// Overdue + unpaid bills due within N Shanghai-calendar days, with per-bill
// daysUntilDue/overdue flags and totals. Needs `read` scope.
export async function GET(request: Request) {
    const guard = await requireScope('read');
    if (guard) return guard;
    const user = await getAuthUser();

    const { searchParams } = new URL(request.url);
    const days = parseDueDays(searchParams.get('days'));
    const statsParam = searchParams.get('includeInStats');
    const includeInStats = statsParam === null ? undefined : statsParam === 'true';

    try {
        const result = await getDueBills(user!.userId as string, days, includeInStats);
        return NextResponse.json(result);
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to fetch due bills' }, { status: 500 });
    }
}
