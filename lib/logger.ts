import prisma from './prisma';

export async function createLog(userId: string, action: string, details?: string, ip?: string) {
    try {
        await prisma.log.create({
            data: {
                userId,
                action,
                details,
                ip
            }
        });
    } catch (error) {
        console.error('Failed to create log:', error);
        // Fail silently to not block the main action
    }
}
