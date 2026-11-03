import prisma from '@/lib/prisma';
// Plain CommonJS helpers shared with scripts/cron-telegram-notify.js (allowJs).
// Source of truth for Shanghai-calendar day math lives there.
import { shCalendarDaysBetween, endOfShDayOffset, shDateString } from './due-date';

export interface DueBill {
    id: string;
    kind: 'pay' | 'receive';
    date: string;
    payee: string | null;
    payAmount: number | null;
    payer: string | null;
    receiveAmount: number | null;
    actualReceiveAmount: number | null;
    notes: string | null;
    isRecurring: boolean;
    recurringInterval: number;
    includeInStats: boolean;
    dedupeKey: string | null;
    daysUntilDue: number; // whole SH-calendar days; negative = overdue by that many days
    overdue: boolean;
}

export interface DueSummary {
    days: number;
    asOf: string; // YYYY-MM-DD, Shanghai calendar
    bills: DueBill[];
    payBills: DueBill[];
    receiveBills: DueBill[];
    totals: {
        count: number;
        overdueCount: number;
        dueSoonCount: number;
        payAmount: number;    // sum of payAmount over returned pay bills
        receiveAmount: number; // sum of receiveAmount over returned receive bills
        payOverdueCount: number;
        receiveOverdueCount: number;
    };
}

// Unsettled bills that are overdue or due within `days` Shanghai-calendar days:
// - Pay bills (payee set): isPaid=false
// - Receive bills (payer set): actualReceiveAmount=null
export async function getDueBills(
    userId: string,
    days: number,
    includeInStats?: boolean
): Promise<DueSummary> {
    const now = new Date();
    const bills = await prisma.bill.findMany({
        where: {
            userId,
            date: { lte: new Date(endOfShDayOffset(days, now)) },
            OR: [
                { payee: { not: null }, isPaid: false },
                { payer: { not: null }, actualReceiveAmount: null },
                { payee: null, payer: null, isPaid: false },
            ],
            ...(includeInStats === undefined ? {} : { includeInStats }),
        },
        orderBy: { date: 'asc' },
        select: {
            id: true, date: true, payee: true, payAmount: true, payer: true,
            receiveAmount: true, actualReceiveAmount: true, notes: true, isRecurring: true,
            recurringInterval: true, includeInStats: true, dedupeKey: true, isPaid: true,
        },
    });

    let payAmount = 0, receiveAmount = 0, overdueCount = 0;
    let payOverdueCount = 0, receiveOverdueCount = 0;
    const payBills: DueBill[] = [];
    const receiveBills: DueBill[] = [];

    const dueBills: DueBill[] = bills.map(b => {
        const daysUntilDue = shCalendarDaysBetween(now, b.date);
        const overdue = daysUntilDue < 0;
        if (overdue) overdueCount++;

        const kind: 'pay' | 'receive' = b.payer ? 'receive' : 'pay';

        if (kind === 'receive') {
            receiveAmount += b.receiveAmount ?? 0;
            if (overdue) receiveOverdueCount++;
        } else {
            payAmount += b.payAmount ?? 0;
            if (overdue) payOverdueCount++;
        }

        const item: DueBill = {
            id: b.id,
            kind,
            date: shDateString(b.date),
            payee: b.payee,
            payAmount: b.payAmount,
            payer: b.payer,
            receiveAmount: b.receiveAmount,
            actualReceiveAmount: b.actualReceiveAmount,
            notes: b.notes,
            isRecurring: b.isRecurring,
            recurringInterval: b.recurringInterval,
            includeInStats: b.includeInStats,
            dedupeKey: b.dedupeKey,
            daysUntilDue,
            overdue,
        };

        if (kind === 'receive') {
            receiveBills.push(item);
        } else {
            payBills.push(item);
        }

        return item;
    });

    return {
        days,
        asOf: shDateString(now),
        bills: dueBills,
        payBills,
        receiveBills,
        totals: {
            count: dueBills.length,
            overdueCount,
            dueSoonCount: dueBills.length - overdueCount,
            payAmount,
            receiveAmount,
            payOverdueCount,
            receiveOverdueCount,
        },
    };
}
