#!/usr/bin/env node
// PayRecord MCP server (stdio transport). Zero dependencies, Node >= 18
// (native fetch). Speaks JSON-RPC 2.0 over newline-delimited stdin/stdout.
//
// Env:
//   PAYRECORD_URL      base URL of the PayRecord service
//                      (default http://localhost:8082; in production use the
//                      HTTPS domain - API keys are rejected on plaintext 8082)
//   PAYRECORD_API_KEY  machine key (X-API-Key). Needs `write` scope for
//                      add_bill / mark_paid, `read` for everything else.
//
// Smoke test:
//   printf '%s\n' \
//     '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}' \
//     '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
//     '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
//     '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_due_bills","arguments":{"days":3}}}' \
//     | PAYRECORD_API_KEY=... node mcp/index.js
'use strict';

const readline = require('node:readline');
const { shDateString } = require('../lib/due-date');

const BASE = (process.env.PAYRECORD_URL || 'http://localhost:8082').replace(/\/+$/, '');
const API_KEY = process.env.PAYRECORD_API_KEY || '';
const SERVER_INFO = { name: 'payrecord-mcp', version: '1.0.0' };

if (!API_KEY) {
    console.error('[payrecord-mcp] PAYRECORD_API_KEY is not set - every tool call will fail.');
}

// ---------- PayRecord HTTP API ----------
async function api(method, path, body) {
    let res;
    try {
        res = await fetch(BASE + path, {
            method,
            headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch (e) {
        throw new Error(`cannot reach ${BASE}: ${e.message}`);
    }
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON error body */ }
    if (!res.ok) {
        const detail = data && data.error ? data.error : JSON.stringify(data);
        const hint = res.status === 401
            ? ' (bad key, or the request bypassed the HTTPS proxy - use the domain as PAYRECORD_URL)'
            : res.status === 403 ? ' (key lacks the required scope)' : '';
        throw new Error(`HTTP ${res.status}: ${detail}${hint}`);
    }
    return data;
}

// ---------- formatting ----------
function fmtAmount(n) {
    return n == null ? '未填' : `¥${Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}
function trunc(s, n) {
    return s == null ? '' : String(s).length > n ? String(s).slice(0, n) + '…' : String(s);
}
// ISO timestamp (UTC "Z" or any offset) -> Asia/Shanghai calendar day.
// Slicing the raw string shows the previous day for UTC-stored +08:00 dates.
function shDay(s) {
    if (!s) return '';
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? String(s).slice(0, 10) : shDateString(d);
}

function billLine(b) {
    const who = b.payee || b.payer || '未知';
    const amount = b.payAmount != null ? fmtAmount(b.payAmount)
        : b.receiveAmount != null ? `收 ${fmtAmount(b.receiveAmount)}`
            : '未填';
    const state = b.isPaid ? `✅已付(${shDay(b.paidDate)})`
        : b.overdue === undefined ? (b.isPaid ? '' : '未付')
            : b.overdue ? `🔴逾期${-b.daysUntilDue}天`
                : b.daysUntilDue === 0 ? '⏰今天' : `${b.daysUntilDue}天后`;
    const notes = b.notes ? `  # ${trunc(b.notes, 40)}` : '';
    return `- [${b.id}] ${shDay(b.date)} ${who} ${amount} ${state}${notes}`;
}

// ---------- tools ----------
const TOOLS = [
    {
        name: 'list_due_bills',
        description: '列出逾期和 N 天内到期的未付账单（含每笔 daysUntilDue/overdue 与合计）。用于每日还款提醒。',
        inputSchema: {
            type: 'object',
            properties: {
                days: { type: 'integer', description: '提前天数，默认 3，0=逾期+今天' },
                includeInStats: { type: 'boolean', description: '按 includeInStats 过滤（true=只要计入统计的，信用卡备忘账单除外）' },
            },
        },
        async run(args) {
            const params = new URLSearchParams({ days: String(args.days ?? 3) });
            if (args.includeInStats !== undefined) params.set('includeInStats', String(args.includeInStats));
            const d = await api('GET', `/api/bills/due?${params}`);
            const head = `截至 ${d.asOf}（未来 ${d.days} 天窗口）：逾期 ${d.totals.overdueCount} 笔、临近 ${d.totals.dueSoonCount} 笔；待付合计 ${fmtAmount(d.totals.payAmount)}` +
                (d.totals.receiveAmount > 0 ? `、待收合计 ${fmtAmount(d.totals.receiveAmount)}` : '');
            return d.bills.length
                ? `${head}\n${d.bills.map(billLine).join('\n')}`
                : `${head}\n（无到期账单）`;
        },
    },
    {
        name: 'list_bills',
        description: '列出某年某月的全部账单（默认当前月，上海时区）。',
        inputSchema: {
            type: 'object',
            properties: {
                year: { type: 'integer', description: '默认当前年' },
                month: { type: 'integer', description: '1-12，默认当前月' },
            },
        },
        async run(args) {
            const [y, m] = shDateString(new Date()).split('-');
            const year = args.year ?? Number(y);
            const month = args.month ?? Number(m);
            const bills = await api('GET', `/api/bills?year=${year}&month=${month}`);
            const unpaid = bills.filter(b => !b.isPaid).length;
            return `${year}-${String(month).padStart(2, '0')} 共 ${bills.length} 笔（未付 ${unpaid}）\n` +
                (bills.length ? bills.map(billLine).join('\n') : '（空）');
        },
    },
    {
        name: 'add_bill',
        description: '新建一笔账单。payee 会先对照商户列表校验（防止拼错导致图标/统计丢失）。带 dedupeKey 的重复提交返回已有账单，不会记双份。',
        inputSchema: {
            type: 'object',
            properties: {
                date: { type: 'string', description: 'ISO 日期，建议带 +08:00，如 2026-11-10T00:00:00+08:00' },
                payee: { type: 'string', description: '待支付方（须在商户列表内，除非 allowNewPayee）' },
                payAmount: { type: 'number', description: '待付金额（0 合法）' },
                payer: { type: 'string', description: '待收款方（收款账单用）' },
                receiveAmount: { type: 'number', description: '待收金额' },
                actualReceiveAmount: { type: 'number', description: '实收金额（填了即视为收款完成）' },
                notes: { type: 'string', description: '备忘' },
                isRecurring: { type: 'boolean', description: '是否每月克隆' },
                recurringInterval: { type: 'integer', description: '周期（月），默认 1' },
                includeInStats: { type: 'boolean', description: '是否计入收支统计；信用卡还款类备忘=false，默认 true' },
                dedupeKey: { type: 'string', description: '幂等键：同一 key 重复提交返回已有账单（duplicated:true）' },
                allowNewPayee: { type: 'boolean', description: '允许使用商户列表之外的 payee（默认 false）' },
            },
            required: ['date'],
        },
        async run(args) {
            if (args.payee && !args.allowNewPayee) {
                const merchants = await api('GET', '/api/merchants');
                const names = merchants.map(m => m.name);
                if (!names.includes(args.payee)) {
                    throw new Error(
                        `payee "${args.payee}" 不在商户列表。可选: ${names.join('、')}` +
                        `\n如确要新建，请让用户先在网页设置商户，或传 allowNewPayee:true。`
                    );
                }
            }
            const bill = await api('POST', '/api/bills', args);
            return bill.duplicated
                ? `duplicated: 已存在相同 dedupeKey 的账单，未重复新建\n${billLine(bill)}`
                : `已创建\n${billLine(bill)}`;
        },
    },
    {
        name: 'mark_paid',
        description: '把一笔账单标记为已支付（isPaid=true），paidDate 默认现在。',
        inputSchema: {
            type: 'object',
            properties: {
                billId: { type: 'string', description: '账单 id（list_due_bills / list_bills 可查）' },
                paidDate: { type: 'string', description: '实际支付日期 ISO，默认 now' },
            },
            required: ['billId'],
        },
        async run(args) {
            let bill;
            try {
                bill = await api('PUT', `/api/bills/${encodeURIComponent(args.billId)}`, {
                    isPaid: true,
                    paidDate: args.paidDate ?? new Date().toISOString(),
                });
            } catch (e) {
                // The API answers 500 for an unknown id; make that readable.
                if (String(e.message).startsWith('HTTP 500')) {
                    throw new Error(`标记失败：账单 ${args.billId} 可能不存在或已被删除（可先用 list_due_bills / list_bills 确认 id）。原始错误: ${e.message}`);
                }
                throw e;
            }
            return `已标记支付\n${billLine(bill)}`;
        },
    },
    {
        name: 'list_merchants',
        description: '列出全部商户（名称+图标状态）。add_bill 的 payee 必须来自这里。',
        inputSchema: { type: 'object', properties: {} },
        async run() {
            const merchants = await api('GET', '/api/merchants');
            return merchants.length
                ? merchants.map(m => `- ${m.name}${m.icon ? ' 🎨' : ''}`).join('\n')
                : '（空）';
        },
    },
];

// ---------- JSON-RPC stdio ----------
function send(msg) {
    process.stdout.write(JSON.stringify(msg) + '\n');
}
function ok(id, result) {
    send({ jsonrpc: '2.0', id, result });
}
function err(id, code, message) {
    send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg) {
    const { id, method, params } = msg;
    const isNotification = id === undefined || id === null;

    if (method === 'initialize') {
        ok(id, {
            protocolVersion: params?.protocolVersion || '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
        });
        return;
    }
    if (method === 'ping') {
        ok(id, {});
        return;
    }
    if (method === 'tools/list') {
        ok(id, {
            tools: TOOLS.map(t => ({
                name: t.name, description: t.description, inputSchema: t.inputSchema,
            })),
        });
        return;
    }
    if (method === 'tools/call') {
        const tool = TOOLS.find(t => t.name === params?.name);
        if (!tool) {
            if (isNotification) return;
            err(id, -32602, `unknown tool: ${params?.name}`);
            return;
        }
        try {
            const args = params.arguments || {};
            const missing = (tool.inputSchema?.required || []).filter(k => args[k] == null || args[k] === '');
            if (missing.length) throw new Error(`缺少必填参数: ${missing.join(', ')}`);
            const text = await tool.run(args);
            ok(id, { content: [{ type: 'text', text }], isError: false });
        } catch (e) {
            // Tool execution failure: report inside the result so the client
            // shows it to the model instead of killing the session.
            ok(id, { content: [{ type: 'text', text: `工具执行失败: ${e.message}` }], isError: true });
        }
        return;
    }
    if (isNotification) return; // notifications/initialized, cancels, etc.
    err(id, -32601, `method not found: ${method}`);
}

// Exit promptly once stdin closes, but never while a request is still being
// served - abrupt exit mid-fetch loses responses in piped/smoke usage.
let pending = 0;
let stdinClosed = false;
function maybeExit() {
    if (stdinClosed && pending === 0) process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
    line = line.trim();
    if (!line) return;
    let msg;
    try {
        msg = JSON.parse(line);
    } catch {
        console.error('[payrecord-mcp] non-JSON input line ignored');
        return;
    }
    pending++;
    Promise.resolve(handle(msg))
        .catch((e) => console.error('[payrecord-mcp] handler error:', e))
        .finally(() => { pending--; maybeExit(); });
});
rl.on('close', () => { stdinClosed = true; maybeExit(); });
