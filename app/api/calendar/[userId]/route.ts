
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import ical from 'ical-generator';
import { startOfMonth } from 'date-fns';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ userId: string }> }
) {
    try {
        const { userId } = await params;

        if (!userId) {
            console.error('UserId is missing');
            return new NextResponse('UserId is required', { status: 400 });
        }

        // 1. Verify User exists
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            console.error(`User not found: ${userId}`);
            return new NextResponse('User not found', { status: 404 });
        }

        // 2. Fetch all bills for the current month onwards
        const startOfCurrentMonth = startOfMonth(new Date());
        const bills = await prisma.bill.findMany({
            where: {
                userId: userId,
                // Removed isPaid: false to include all bills
                date: {
                    gte: startOfCurrentMonth,
                },
            },
            orderBy: {
                date: 'asc',
            },
        });

        // 3. Generate ICS
        const calendar = ical({
            name: 'PayRecord Bills',
            timezone: 'Asia/Shanghai', // Or make it dynamic if needed, defaulting to generic
        });

        bills.forEach((bill) => {
            const statusIcon = bill.isPaid ? '✅' : '⭕';
            const statusText = bill.isPaid ? 'Paid' : 'Unpaid';

            calendar.createEvent({
                start: bill.date,
                allDay: true,
                summary: `${statusIcon} Pay: ${bill.payee || 'Unknown'} - ${bill.payAmount || 0}`,
                description: `Status: ${statusText}\nAmount: ${bill.payAmount || 0}\nNotes: ${bill.notes || ''}`,
                // You can add more fields if necessary, like URL or location
            });
        });

        // 4. Return response
        return new NextResponse(calendar.toString(), {
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Disposition': 'attachment; filename="bills.ics"',
            },
        });

    } catch (error) {
        console.error('Error generating ICS:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
