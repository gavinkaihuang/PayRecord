import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUser, requireWebUser } from '@/lib/auth';
import { logAction } from '@/lib/logger';
import { isMaskedSecret, maskSecret } from '@/lib/mask';
import bcrypt from 'bcryptjs';

export async function GET() {
    try {
        const guard = await requireWebUser();
        if (guard) return guard;
        const user = await getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userData = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
                id: true,
                username: true,
                nickname: true,
                telegramToken: true,
                telegramChatId: true
            }
        });

        if (!userData) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Never hand the raw bot token to the browser - a masked echo is
        // enough for the settings UI, and PUT treats the mask as "unchanged".
        return NextResponse.json({
            ...userData,
            telegramToken: maskSecret(userData.telegramToken),
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const guard = await requireWebUser();
        if (guard) return guard;
        const sessionUser = await getUser();
        if (!sessionUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { nickname, password, telegramToken, telegramChatId } = body;

        // Fetch current user details from DB
        const currentUser = await prisma.user.findUnique({
            where: { id: sessionUser.id }
        });

        if (!currentUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Masked echo from the settings form means "leave the token alone";
        // any other value (including '' to clear) is a real change.
        const telegramTokenChanged =
            telegramToken !== undefined && !isMaskedSecret(telegramToken) &&
            telegramToken !== currentUser.telegramToken;

        const updateData: any = {
            telegramChatId
        };
        if (telegramToken !== undefined && !isMaskedSecret(telegramToken)) {
            updateData.telegramToken = telegramToken;
        }

        let actions = [];

        if (nickname !== undefined && nickname !== currentUser.nickname) {
            updateData.nickname = nickname;
            actions.push('UPDATE_NICKNAME');
        }

        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateData.password = hashedPassword;
            actions.push('UPDATE_PASSWORD');
        }

        if (telegramTokenChanged) {
            actions.push('UPDATE_TELEGRAM');
        }

        console.log('Updating user in DB...');
        const updatedUser = await prisma.user.update({
            where: { id: sessionUser.id },
            data: updateData
        });
        console.log('User updated:', updatedUser.id);

        try {
            if (actions.length > 0) {
                await logAction(sessionUser.id, 'UPDATE_PROFILE', `Updated: ${actions.join(', ')}`);
            } else {
                await logAction(sessionUser.id, 'UPDATE_PROFILE', 'Updated profile details');
            }
            console.log('Log created');
        } catch (logError) {
            console.error('Log creation failed explicitly:', logError);
        }

        return NextResponse.json({
            username: updatedUser.username,
            nickname: updatedUser.nickname,
            telegramToken: maskSecret(updatedUser.telegramToken),
            telegramChatId: updatedUser.telegramChatId
        });

    } catch (error) {
        console.error('Error updating profile:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown Error'
        }, { status: 500 });
    }
}
