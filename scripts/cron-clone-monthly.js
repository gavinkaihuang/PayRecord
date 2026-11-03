#!/usr/bin/env node
// Automated monthly recurring bill rollover cron job.
//
// Automatically clones recurring bills into the current (or next) month,
// including monthly bills and matching multi-month/quarterly bills (e.g. rent every 3 months).
//
// Usage:
//   node scripts/cron-clone-monthly.js                # clone into current month (1st of month)
//   node scripts/cron-clone-monthly.js --target=next  # clone into next month
//   node scripts/cron-clone-monthly.js --dry-run      # preview only, do not write DB
//   node scripts/cron-clone-monthly.js --notify       # notify via Telegram after clone
//
'use strict';

const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const { shDateString } = require('../lib/due-date');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const NOTIFY_TG = process.argv.includes('--notify');
const TARGET_NEXT = process.argv.includes('--target=next');

async function cloneForUser(user, targetYear, targetMonth) {
    const targetStartDate = new Date(targetYear, targetMonth - 1, 1);
    const targetEndDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    // Look back up to 12 months before target
    const pastWindowStart = new Date(targetYear, targetMonth - 1 - 12, 1);
    const pastRecurringBills = await prisma.bill.findMany({
        where: {
            userId: user.id,
            isRecurring: true,
            date: { gte: pastWindowStart, lt: targetStartDate }
        },
        orderBy: { date: 'desc' }
    });

    const candidateBills = [];
    const seenKeys = new Set();

    for (const bill of pastRecurringBills) {
        const key = bill.payee ? `payee:${bill.payee}` : bill.payer ? `payer:${bill.payer}` : `id:${bill.id}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        const billYear = bill.date.getFullYear();
        const billMonth = bill.date.getMonth() + 1;
        const diffMonths = (targetYear - billYear) * 12 + (targetMonth - billMonth);
        const interval = bill.recurringInterval && bill.recurringInterval > 0 ? bill.recurringInterval : 1;

        if (diffMonths === interval) {
            candidateBills.push(bill);
        }
    }

    const targetBills = await prisma.bill.findMany({
        where: {
            userId: user.id,
            date: { gte: targetStartDate, lte: targetEndDate }
        }
    });

    const billsToDelete = [];
    const billsToCreate = [];
    let skippedCount = 0;

    for (const bill of candidateBills) {
        const targetMaxDay = new Date(targetYear, targetMonth, 0).getDate();
        const targetDay = Math.min(bill.date.getDate(), targetMaxDay);
        const targetDate = new Date(
            targetYear,
            targetMonth - 1,
            targetDay,
            bill.date.getHours(),
            bill.date.getMinutes(),
            bill.date.getSeconds()
        );

        const existingBill = targetBills.find(b => b.payee === bill.payee && b.payer === bill.payer);
        if (existingBill) {
            const isEdited = existingBill.isPaid || existingBill.actualReceiveAmount !== null;
            if (isEdited) {
                skippedCount++;
                continue;
            } else {
                if (!billsToDelete.includes(existingBill.id)) {
                    billsToDelete.push(existingBill.id);
                }
            }
        }

        billsToCreate.push({
            userId: user.id,
            date: targetDate,
            payee: bill.payee,
            payAmount: null,
            payer: bill.payer,
            receiveAmount: null,
            notes: bill.notes,
            isRecurring: bill.isRecurring,
            recurringInterval: bill.recurringInterval || 1,
            includeInStats: bill.includeInStats,
            isPaid: false,
            paidDate: null,
            actualReceiveAmount: null
        });
    }

    if (!DRY_RUN) {
        const ops = [];
        if (billsToDelete.length > 0) {
            ops.push(prisma.bill.deleteMany({ where: { id: { in: billsToDelete } } }));
        }
        if (billsToCreate.length > 0) {
            ops.push(prisma.bill.createMany({ data: billsToCreate }));
        }
        if (ops.length > 0) {
            await prisma.$transaction(ops);
        }
    }

    return {
        created: billsToCreate,
        deletedCount: billsToDelete.length,
        skippedCount,
    };
}

async function main() {
    const now = new Date();
    const [currY, currM] = shDateString(now).split('-').map(Number);

    let targetYear = currY;
    let targetMonth = currM;
    if (TARGET_NEXT) {
        targetMonth = currM === 12 ? 1 : currM + 1;
        targetYear = currM === 12 ? currY + 1 : currY;
    }

    console.log(`[cron-clone-monthly] Rollover starting -> target: ${targetYear}-${String(targetMonth).padStart(2, '0')}${DRY_RUN ? ' (dry-run)' : ''}`);

    const users = await prisma.user.findMany({
        select: { id: true, username: true, telegramChatId: true, telegramToken: true }
    });

    for (const user of users) {
        const res = await cloneForUser(user, targetYear, targetMonth);
        console.log(`User ${user.username}: created=${res.created.length}, replaced=${res.deletedCount}, skipped=${res.skippedCount}`);

        if (res.created.length > 0) {
            res.created.forEach(b => {
                const who = b.payer ? `[收] ${b.payer}` : (b.payee || '未命名');
                const cycle = b.recurringInterval > 1 ? `（${b.recurringInterval}个月周期）` : '';
                console.log(`  + ${shDateString(b.date)} ${who}${cycle} ${b.notes ? '#' + b.notes : ''}`);
            });
        }

        if (NOTIFY_TG && !DRY_RUN && user.telegramChatId && res.created.length > 0) {
            const token = user.telegramToken || process.env.TELEGRAM_BOT_TOKEN;
            if (token) {
                const lines = res.created.map((b, i) => {
                    const who = b.payer ? `[收] ${b.payer}` : (b.payee || '未命名');
                    const cycle = b.recurringInterval > 1 ? `（${b.recurringInterval}月期）` : '';
                    return `${i + 1}. ${shDateString(b.date).slice(5)} ${who}${cycle}`;
                });
                const msg = `📅 **PayRecord 月度账单自动滚存**（${targetYear}-${String(targetMonth).padStart(2, '0')}）\n\n` +
                    `已自动为你生成 ${res.created.length} 笔本月周期账单：\n` +
                    lines.join('\n') + `\n\n出账后请告诉 Hermes 补全金额或标记还款。`;
                try {
                    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: user.telegramChatId, text: msg, parse_mode: 'Markdown' })
                    });
                    console.log(`Sent TG notification to ${user.username}`);
                } catch (e) {
                    console.error(`Failed to send TG notify to ${user.username}: ${e.message}`);
                }
            }
        }
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
}).finally(() => prisma.$disconnect());
