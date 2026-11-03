// Telegram cron reminder for due bills.
// Same "due" semantics as GET /api/bills/due (see lib/due.ts): unpaid bills
// overdue or due within N Shanghai-calendar days, includeInStats=false
// excluded (credit-card memo bills are not real reminders).
//
// Usage:
//   node scripts/cron-telegram-notify.js            # send via Telegram
//   node scripts/cron-telegram-notify.js --dry-run  # print messages, send nothing
// Env:
//   CRON_DUE_DAYS  look-ahead days (default 2, matches previous behavior)
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const { shCalendarDaysBetween, endOfShDayOffset, shDateString } = require('../lib/due-date');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const DUE_DAYS = Math.max(0, Math.min(90, parseInt(process.env.CRON_DUE_DAYS || '2', 10) || 2));

function formatAmount(n) {
    return (n ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

// One aggregated message per user: overdue group first, then due-soon group.
function buildMessage(asOf, bills) {
    const overdue = bills.filter(b => b.daysUntilDue < 0);
    const dueSoon = bills.filter(b => b.daysUntilDue >= 0);
    const payTotal = bills.reduce((s, b) => s + (b.payAmount ?? 0), 0);
    const recvTotal = bills.reduce((s, b) => s + (b.receiveAmount ?? 0), 0);

    const line = (b, i) => {
        const when = b.overdue
            ? `逾期${-b.daysUntilDue}天`
            : b.daysUntilDue === 0 ? '今天到期' : `${b.daysUntilDue}天后到期`;
        const name = b.payee || b.payer || '未知';
        const amount = b.payAmount != null ? `¥${formatAmount(b.payAmount)}`
            : b.receiveAmount != null ? `收¥${formatAmount(b.receiveAmount)}`
                : '金额未填';
        return `${i + 1}. ${b.date} ${name} ${amount}（${when}）${b.notes ? `\n   _${b.notes}_` : ''}`;
    };

    let m = `📅 **PayRecord 账单提醒**（${asOf}）\n\n`;
    if (overdue.length) {
        m += `🔴 **逾期 ${overdue.length} 笔**\n` + overdue.map(line).join('\n') + '\n\n';
    }
    if (dueSoon.length) {
        m += `🟡 **${DUE_DAYS} 天内到期 ${dueSoon.length} 笔**\n` + dueSoon.map(line).join('\n') + '\n\n';
    }
    m += `合计：待付 ¥${formatAmount(payTotal)}` +
        (recvTotal > 0 ? ` / 待收 ¥${formatAmount(recvTotal)}` : '');
    return m;
}

async function main() {
    console.log(`Telegram notify job starting (days=${DUE_DAYS}${DRY_RUN ? ', dry-run' : ''})...`);

    try {
        const users = await prisma.user.findMany({
            where: { telegramChatId: { not: null } },
            select: { id: true, username: true, telegramToken: true, telegramChatId: true }
        });
        console.log(`Found ${users.length} users with Telegram configured.`);

        const now = new Date();
        const dueBefore = new Date(endOfShDayOffset(DUE_DAYS, now));

        for (const user of users) {
            if (!user.telegramChatId) continue;
            const botToken = user.telegramToken || process.env.TELEGRAM_BOT_TOKEN;
            if (!botToken && !DRY_RUN) {
                console.warn(`Skipping user ${user.username}: no Telegram bot token found.`);
                continue;
            }

            const bills = await prisma.bill.findMany({
                where: {
                    userId: user.id,
                    isPaid: false,
                    includeInStats: true,
                    date: { lte: dueBefore }
                },
                orderBy: { date: 'asc' }
            });

            if (bills.length === 0) {
                console.log(`User ${user.username}: no bills due.`);
                continue;
            }

            const enriched = bills.map(b => ({
                date: shDateString(b.date),
                payee: b.payee,
                payer: b.payer,
                payAmount: b.payAmount,
                receiveAmount: b.receiveAmount,
                notes: b.notes,
                daysUntilDue: shCalendarDaysBetween(now, b.date),
            }));
            enriched.forEach(b => { b.overdue = b.daysUntilDue < 0; });

            const message = buildMessage(shDateString(now), enriched);
            if (DRY_RUN) {
                console.log(`\n===== [dry-run] message for ${user.username} =====\n${message}\n`);
                continue;
            }

            const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: user.telegramChatId,
                    text: message,
                    parse_mode: 'Markdown'
                })
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
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
