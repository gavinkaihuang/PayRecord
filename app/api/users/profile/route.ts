import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUser } from '@/lib/auth';
import { logAction } from '@/lib/logger';
import bcrypt from 'bcryptjs';

export async function GET() {
    try {
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

        return NextResponse.json(userData);
    } catch (error) {
        console.error('Error fetching profile:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
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

        const updateData: any = {
            telegramToken,
            telegramChatId
        };

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

        if (telegramToken && telegramToken !== currentUser.telegramToken) {
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
            telegramToken: updatedUser.telegramToken,
            telegramChatId: updatedUser.telegramChatId
        });

    } catch (error) {
        console.error('Error updating profile:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown Error'
        }, { status: 500 });
    }
}
