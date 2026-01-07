const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    console.log('Starting Telegram Notification Job...');

    try {
        // 1. Fetch Users with Telegram Chat ID
        const users = await prisma.user.findMany({
            where: {
                telegramChatId: { not: null }
            },
            select: {
                id: true,
                username: true,
                telegramToken: true,
                telegramChatId: true
            }
        });

        console.log(`Found ${users.length} users with Telegram configured.`);

        for (const user of users) {
            console.log(`Processing user: ${user.username}`);

            if (!user.telegramChatId) continue;
            // Use user's token if available, otherwise relies on a potential system-wide env var or skips?
            // User requested pushing to "system set telegram account".
            // The schema has `telegramToken` on User. 
            // If user.telegramToken is missing, we can't send unless we have a fallback.
            // Assuming for now the user provides their own bot token OR we use an environment variable BOT_TOKEN.
            // Let's use user.telegramToken first, fall back to process.env.TELEGRAM_BOT_TOKEN

            const botToken = user.telegramToken || process.env.TELEGRAM_BOT_TOKEN;

            if (!botToken) {
                console.warn(`Skipping user ${user.username}: No Telegram Bot Token found.`);
                continue;
            }

            // 2. Find Bills
            // Rule: "Expired" OR "Due within 2 days"
            // Expired: date < now (and not paid)
            // Due within 2 days: date >= now AND date <= now + 2 days

            // Combined: date <= now + 2 days AND isPaid = false

            const now = new Date();
            const threshold = new Date();
            threshold.setDate(now.getDate() + 2);
            // Set threshold to end of that day to be inclusive?
            threshold.setHours(23, 59, 59, 999);

            const bills = await prisma.bill.findMany({
                where: {
                    userId: user.id,
                    isPaid: false,
                    date: {
                        lte: threshold
                    }
                },
                orderBy: {
                    date: 'asc'
                }
            });

            if (bills.length === 0) {
                console.log(`User ${user.username}: No bills due.`);
                continue;
            }

            // 3. Construct Message
            let message = `📅 **PayRecord Bill Reminder**\n\n`;
            message += `You have **${bills.length}** unpaid bills due soon or overdue:\n\n`;

            bills.forEach((bill, index) => {
                const dateStr = new Date(bill.date).toLocaleDateString();
                const name = bill.payee || bill.payer || 'Unknown';
                const amount = bill.payAmount || bill.receiveAmount || 0;
                // Add an emoji for overdue
                const isOverdue = new Date(bill.date) < new Date().setHours(0, 0, 0, 0);
                const statusIcon = isOverdue ? '🔴' : '🟡';

                message += `${index + 1}. ${statusIcon} **${dateStr}**: ${name} (¥${amount})\n`;
                if (bill.notes) message += `   _${bill.notes}_\n`;
            });

            // 4. Send Notification
            const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
            const body = {
                chat_id: user.telegramChatId,
                text: message,
                parse_mode: 'Markdown'
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const result = await res.json();
            if (result.ok) {
                console.log(`Notification sent to ${user.username} (ChatID: ${user.telegramChatId})`);
            } else {
                console.error(`Failed to send to ${user.username}:`, result);
            }
        }

    } catch (error) {
        console.error('Job failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
