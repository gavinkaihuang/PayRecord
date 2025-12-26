import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { headers } from 'next/headers';

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

export async function getUser() {
    const headersList = await headers();
    const token = headersList.get('authorization')?.split(' ')[1];
    if (!token) return null;
    const payload = await verifyToken(token);
    if (!payload) return null;
    return { id: payload.userId as string, username: payload.username as string };
}
