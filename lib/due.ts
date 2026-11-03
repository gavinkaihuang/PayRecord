import prisma from '@/lib/prisma';
// Plain CommonJS helpers shared with scripts/cron-telegram-notify.js (allowJs).
// Source of truth for Shanghai-calendar day math lives there.
import { shCalendarDaysBetween, endOfShDayOffset, shDateString } from './due-date';

export interface DueBill {
    id: string;
    date: string;
    payee: string | null;
    payAmount: number | null;
    payer: string | null;
    receiveAmount: number | null;
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
    totals: {
        count: number;
        overdueCount: number;
        dueSoonCount: number;
        payAmount: number;    // sum of payAmount over returned bills
        receiveAmount: number; // sum of receiveAmount over returned bills
    };
}

// Unpaid bills that are overdue or due within `days` Shanghai-calendar days,
// regardless of server timezone. Shared query semantics: isPaid=false only.
export async function getDueBills(
    userId: string,
    days: number,
    includeInStats?: boolean
): Promise<DueSummary> {
    const now = new Date();
    const bills = await prisma.bill.findMany({
        where: {
            userId,
            isPaid: false,
            date: { lte: new Date(endOfShDayOffset(days, now)) },
            ...(includeInStats === undefined ? {} : { includeInStats }),
        },
        orderBy: { date: 'asc' },
        select: {
            id: true, date: true, payee: true, payAmount: true, payer: true,
            receiveAmount: true, notes: true, isRecurring: true,
            recurringInterval: true, includeInStats: true, dedupeKey: true,
        },
    });

    let payAmount = 0, receiveAmount = 0, overdueCount = 0;
    const dueBills: DueBill[] = bills.map(b => {
        const daysUntilDue = shCalendarDaysBetween(now, b.date);
        const overdue = daysUntilDue < 0;
        if (overdue) overdueCount++;
        payAmount += b.payAmount ?? 0;
        receiveAmount += b.receiveAmount ?? 0;
        return {
            id: b.id,
            date: shDateString(b.date),
            payee: b.payee,
            payAmount: b.payAmount,
            payer: b.payer,
            receiveAmount: b.receiveAmount,
            notes: b.notes,
            isRecurring: b.isRecurring,
            recurringInterval: b.recurringInterval,
            includeInStats: b.includeInStats,
            dedupeKey: b.dedupeKey,
            daysUntilDue,
            overdue,
        };
    });

    return {
        days,
        asOf: shDateString(now),
        bills: dueBills,
        totals: {
            count: dueBills.length,
            overdueCount,
            dueSoonCount: dueBills.length - overdueCount,
            payAmount,
            receiveAmount,
        },
    };
}
