import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPassword, signToken } from '@/lib/auth';
import { logAction } from '@/lib/logger';
import { headers } from 'next/headers';

export async function POST(request: Request) {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { username },
        });

        if (!user || !(await verifyPassword(password, user.password))) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        const token = await signToken({ userId: user.id, username: user.username });

        // Log Login
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        await logAction(user.id, 'LOGIN', 'User logged in', ip);

        // Return token and user info
        return NextResponse.json({
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
