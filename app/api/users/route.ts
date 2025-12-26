import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, verifyToken } from '@/lib/auth';
import { headers } from 'next/headers';

async function isAuthenticated() {
    const headersList = await headers();
    const authHeader = headersList.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    return await verifyToken(token);
}

// Get all users
export async function GET(request: Request) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const users = await prisma.user.findMany({
            select: { id: true, username: true, createdAt: true }
        });
        return NextResponse.json(users);
    } catch (e) {
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}

// Create new user
export async function POST(request: Request) {
    const currentUser = await isAuthenticated();
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Ideally check if currentUser is admin? For now, any logged in user can add user per req "User create new user" (ambiguous, but usually restricted. I'll allow logged in users for now as simplified interpretation).

    try {
        const { username, password } = await request.json();
        if (!username || !password) {
            return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
        }

        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return NextResponse.json({ error: 'User already exists' }, { status: 400 });
        }

        const passwordHash = await hashPassword(password);
        const newUser = await prisma.user.create({
            data: {
                username,
                password: passwordHash
            },
            select: { id: true, username: true, createdAt: true }
        });
        return NextResponse.json(newUser);
    } catch (e) {
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
}
