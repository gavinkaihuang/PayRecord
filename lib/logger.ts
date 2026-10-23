import prisma from '@/lib/prisma';

export async function logAction(
    userId: string,
    action: string,
    details?: string | null,
    ip?: string | null,
    actor?: string | null
) {
    try {
        await prisma.log.create({
            data: {
                userId,
                action,
                details,
                ip,
                actor
            }
        });
    } catch (e) {
        console.error('Failed to log action:', e);
        // Don't throw, logging failure shouldn't block main action
    }
}
