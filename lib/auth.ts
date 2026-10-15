import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { headers } from 'next/headers';
import prisma from '@/lib/prisma';

const SECRET_KEY = process.env.JWT_SECRET || 'default-secret-key-change-it';
const key = new TextEncoder().encode(SECRET_KEY);

export async function hashPassword(password: string) {
    return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
    return await bcrypt.compare(password, hash);
}

export async function signToken(payload: any) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(key);
}

export async function verifyToken(token: string) {
    try {
        const { payload } = await jwtVerify(token, key, {
            algorithms: ['HS256'],
        });
        return payload;
    } catch (error) {
        return null;
    }
}

// Resolve a user from an X-API-Key header (machine auth). Returns null when
// absent or invalid. Only users with apiKeyHash set are candidates; comparison
// is bcrypt so plaintext keys are never stored. With few users a scan is
// negligible; if the user table ever grows, switch to a key-id prefix lookup.
async function findUserByApiKey(apiKey: string): Promise<{ id: string; username: string } | null> {
    const candidates = await prisma.user.findMany({
        where: { apiKeyHash: { not: null } },
        select: { id: true, username: true, apiKeyHash: true }
    });
    for (const u of candidates) {
        if (u.apiKeyHash && (await bcrypt.compare(apiKey, u.apiKeyHash))) {
            return { id: u.id, username: u.username };
        }
    }
    return null;
}

// Unified auth for API routes: X-API-Key first (machine/Hermes), then Bearer JWT (web).
// If an X-API-Key header is present it MUST be valid - no fall-through to JWT,
// so a bad key is always rejected. Returns JWT-compatible { userId, username }.
export async function getAuthUser(): Promise<{ userId: string; username: string } | null> {
    const headersList = await headers();
    const apiKey = headersList.get('x-api-key');
    if (apiKey) {
        const user = await findUserByApiKey(apiKey);
        return user ? { userId: user.id, username: user.username } : null;
    }
    const authHeader = headersList.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token);
    if (!payload) return null;
    return { userId: payload.userId as string, username: payload.username as string };
}

export async function getUser() {
    const headersList = await headers();
    const apiKey = headersList.get('x-api-key');
    if (apiKey) {
        return await findUserByApiKey(apiKey);
    }
    const token = headersList.get('authorization')?.split(' ')[1];
    if (!token) return null;
    const payload = await verifyToken(token);
    if (!payload) return null;
    return { id: payload.userId as string, username: payload.username as string };
}
