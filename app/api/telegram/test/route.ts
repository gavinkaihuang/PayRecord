import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUser, requireWebUser } from '@/lib/auth';
import { sendTelegramMessage } from '@/lib/telegram';
import { isMaskedSecret } from '@/lib/mask';

export async function POST(request: Request) {
    try {
        const guard = await requireWebUser();
        if (guard) return guard;
        const user = await getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { token, chatId } = await request.json();

        // The settings form may echo the masked token from GET /profile -
        // in that case test against the stored credential instead.
        let effectiveToken = isMaskedSecret(token) ? null : token;
        if (!effectiveToken) {
            const stored = await prisma.user.findUnique({
                where: { id: user.id },
                select: { telegramToken: true }
            });
            effectiveToken = stored?.telegramToken || null;
        }

        if (!effectiveToken || !chatId) {
            return NextResponse.json({ error: 'Token and Chat ID are required' }, { status: 400 });
        }

        await sendTelegramMessage(effectiveToken, chatId, "<b>Test Message from PayRecord</b>\n\nYour Telegram integration is working correctly! 🎉");

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Telegram test error:', error);
        return NextResponse.json({ error: error.message || 'Failed to send message' }, { status: 500 });
    }
}
