import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const SECRET_KEY = process.env.JWT_SECRET || 'default-secret-key-change-it';
const key = new TextEncoder().encode(SECRET_KEY);

// A scope a machine key may hold. Keys are per-agent (hermes/muse/...);
// the web UI authenticates via JWT and is not scope-limited.
export type Scope = 'read' | 'write' | 'delete';

export interface AuthContext {
    userId: string;
    username: string;
    actor: string;              // "user:<username>" or "key:<name>" - stamp onto every write log
    scopes: Scope[] | null;     // null = JWT (web) = unrestricted
    apiKeyId?: string;          // set for modern-table keys (used for lastUsedAt)
}

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

function parseScopes(raw: string): Scope[] {
    return raw.split(',').map(s => s.trim()).filter(s =>
        s === 'read' || s === 'write' || s === 'delete'
    ) as Scope[];
}

// Resolve a plaintext X-API-Key to its key record.
// Order: modern ApiKey table first, then legacy User.apiKeyHash (auto-migrated
// to an ApiKey row named "legacy" on first successful use, so old keys keep
// working across the upgrade with no manual step).
// Revoked keys (revokedAt set) never match, even with a valid hash.
async function findApiKey(apiKey: string): Promise<{
    id: string; userId: string; username: string; name: string; scopes: Scope[]
} | null> {
    const rows = await prisma.apiKey.findMany({
        where: { revokedAt: null },
        include: { user: { select: { username: true } } }
    });
    for (const row of rows) {
        if (await bcrypt.compare(apiKey, row.keyHash)) {
            return {
                id: row.id, userId: row.userId,
                username: row.user.username, name: row.name,
                scopes: parseScopes(row.scopes)
            };
        }
    }
    // legacy single-key fallback (User.apiKeyHash)
    const candidates = await prisma.user.findMany({
        where: { apiKeyHash: { not: null } },
        select: { id: true, username: true, apiKeyHash: true }
    });
    for (const u of candidates) {
        if (u.apiKeyHash && (await bcrypt.compare(apiKey, u.apiKeyHash))) {
            // migrate: move the hash into an ApiKey row named "legacy" (best-effort;
            // unique(userId,name) collision just means it already migrated)
            try {
                await prisma.apiKey.create({
                    data: {
                        userId: u.id, name: 'legacy', keyHash: u.apiKeyHash,
                        scopes: 'read,write,delete'
                    }
                });
            } catch (e) { /* already migrated */ }
            return {
                id: 'legacy', userId: u.id, username: u.username,
                name: 'legacy', scopes: ['read', 'write', 'delete']
            };
        }
    }
    return null;
}

// API keys are only honored when the request arrived through the trusted HTTPS
// proxy (Caddy injects X-Proxy-Secret). Direct-to-port callers on plaintext
// 8082 cannot use machine keys - the key would travel unencrypted. When
// PROXY_HEADER_SECRET is unset the gate is disabled (local dev / pre-Caddy).
function proxyGateOk(headersList: Headers): boolean {
    const secret = process.env.PROXY_HEADER_SECRET;
    if (!secret) return true;
    return headersList.get('x-proxy-secret') === secret;
}

// Unified auth for API routes: X-API-Key first (machine/Hermes/Muse), then
// Bearer JWT (web). If an X-API-Key header is present it MUST be valid - no
// fall-through to JWT, so a bad key is always rejected.
export async function getAuthUser(): Promise<AuthContext | null> {
    const headersList = await headers();
    const apiKey = headersList.get('x-api-key');
    if (apiKey) {
        if (!proxyGateOk(headersList)) return null; // key outside TLS proxy = invalid
        const found = await findApiKey(apiKey);
        if (!found) return null;
        // fire-and-forget lastUsedAt (never block a request on this)
        if (found.id !== 'legacy') {
            prisma.apiKey.update({ where: { id: found.id }, data: { lastUsedAt: new Date() } })
                .catch(() => { });
        }
        return {
            userId: found.userId, username: found.username,
            actor: `key:${found.name}`, scopes: found.scopes, apiKeyId: found.id
        };
    }
    const authHeader = headersList.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token);
    if (!payload) return null;
    return {
        userId: payload.userId as string, username: payload.username as string,
        actor: `user:${payload.username as string}`, scopes: null
    };
}

// Scope guard for route handlers: returns a 401/403 NextResponse to send when
// rejected, or null when the caller may proceed. JWT (web) always passes.
// Usage:
//   const guard = await requireScope('write');
//   if (guard) return guard;
export async function requireScope(scope: Scope): Promise<NextResponse | null> {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.scopes !== null && !user.scopes.includes(scope)) {
        return NextResponse.json(
            { error: `API key lacks required scope: ${scope}` },
            { status: 403 }
        );
    }
    return null;
}

// Web-only guard for account/credential endpoints (profile, telegram binding,
// user management, uploads): any valid machine key gets 403. Agents (Hermes,
// Muse) must not rotate passwords or TG bindings. A BAD key still falls
// through to the route's own 401.
// Usage:
//   const guard = await requireWebUser();
//   if (guard) return guard;
export async function requireWebUser(): Promise<NextResponse | null> {
    const headersList = await headers();
    if (!headersList.get('x-api-key')) return null; // no key header -> web path, fine
    const user = await getAuthUser();
    if (user && user.scopes !== null) {
        return NextResponse.json(
            { error: 'This endpoint is web-only (JWT login); API keys are not allowed' },
            { status: 403 }
        );
    }
    return null;
}

export async function getUser() {
    const headersList = await headers();
    const apiKey = headersList.get('x-api-key');
    if (apiKey) {
        if (!proxyGateOk(headersList)) return null; // key outside TLS proxy = invalid
        const found = await findApiKey(apiKey);
        return found ? { id: found.userId, username: found.username } : null;
    }
    const token = headersList.get('authorization')?.split(' ')[1];
    if (!token) return null;
    const payload = await verifyToken(token);
    if (!payload) return null;
    return { id: payload.userId as string, username: payload.username as string };
}
