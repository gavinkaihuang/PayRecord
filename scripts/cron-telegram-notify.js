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

// One aggregated message per user: pay bills and receive bills grouped clearly.
function buildMessage(asOf, bills) {
    const payBills = bills.filter(b => !b.payer);
    const recvBills = bills.filter(b => Boolean(b.payer));

    const payOverdue = payBills.filter(b => b.daysUntilDue < 0);
    const payDueSoon = payBills.filter(b => b.daysUntilDue >= 0);

    const recvOverdue = recvBills.filter(b => b.daysUntilDue < 0);
    const recvDueSoon = recvBills.filter(b => b.daysUntilDue >= 0);

    const payTotal = payBills.reduce((s, b) => s + (b.payAmount ?? 0), 0);
    const recvTotal = recvBills.reduce((s, b) => s + (b.receiveAmount ?? 0), 0);

    const line = (b, i) => {
        const isRecv = Boolean(b.payer);
        const when = b.overdue
            ? `逾期${-b.daysUntilDue}天`
            : b.daysUntilDue === 0 ? '今天到期' : `${b.daysUntilDue}天后到期`;
        const name = (isRecv ? `[收] ${b.payer}` : (b.payee || '未知'));
        const amount = isRecv
            ? (b.receiveAmount != null ? `待收 ¥${formatAmount(b.receiveAmount)}` : '待收金额未填')
            : (b.payAmount != null ? `¥${formatAmount(b.payAmount)}` : '金额未填');
        return `${i + 1}. ${b.date} ${name} ${amount}（${when}）${b.notes ? `\n   _${b.notes}_` : ''}`;
    };

    let m = `📅 **PayRecord 账单提醒**（${asOf}）\n\n`;

    if (payOverdue.length) {
        m += `🔴 **还款逾期 ${payOverdue.length} 笔**\n` + payOverdue.map(line).join('\n') + '\n\n';
    }
    if (payDueSoon.length) {
        m += `🟡 **${DUE_DAYS} 天内还款 ${payDueSoon.length} 笔**\n` + payDueSoon.map(line).join('\n') + '\n\n';
    }

    if (recvOverdue.length) {
        m += `🔴 **收款逾期 ${recvOverdue.length} 笔**\n` + recvOverdue.map(line).join('\n') + '\n\n';
    }
    if (recvDueSoon.length) {
        m += `🟢 **${DUE_DAYS} 天内待收款 ${recvDueSoon.length} 笔**\n` + recvDueSoon.map(line).join('\n') + '\n\n';
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
                    includeInStats: true,
                    date: { lte: dueBefore },
                    OR: [
                        { payee: { not: null }, isPaid: false },
                        { payer: { not: null }, actualReceiveAmount: null },
                        { payee: null, payer: null, isPaid: false },
                    ]
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
