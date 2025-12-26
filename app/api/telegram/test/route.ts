import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { sendTelegramMessage } from '@/lib/telegram';

export async function POST(request: Request) {
    try {
        const user = await getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { token, chatId } = await request.json();

        if (!token || !chatId) {
            return NextResponse.json({ error: 'Token and Chat ID are required' }, { status: 400 });
        }

        await sendTelegramMessage(token, chatId, "<b>Test Message from PayRecord</b>\n\nYour Telegram integration is working correctly! 🎉");

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Telegram test error:', error);
        return NextResponse.json({ error: error.message || 'Failed to send message' }, { status: 500 });
    }
}
