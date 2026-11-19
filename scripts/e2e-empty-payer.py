#!/usr/bin/env python3
"""E2E: payer='' 归正回归测试。

验证目标（本次修复语义）：
1. POST 创建账单时 payer='' 应被存成 NULL（读回 payer is None）
2. 已付 + payer='' 的账单不得出现在 /api/bills/due 逾期列表
3. 未付 + payee 正常 + payer='' 的账单应出现在 due（正常待付）
4. 真收款单（payer=真名）未回填实收 → 出现在 due 待收
5. 真收款单已回填实收 → 不出现在 due
"""
import json, urllib.request, urllib.error, sys

BASE = "http://localhost:8082"
KEY = open('/tmp/prk.txt').read().strip().splitlines()[-1]
AK = {'X-API-Key': KEY, 'User-Agent': 'E2E/1.0'}

passed, failed = [], []

def req(method, path, body=None):
    h = dict(AK)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h['Content-Type'] = 'application/json'
    r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            t = resp.read().decode()
            return resp.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t

def check(name, cond, detail=""):
    (passed if cond else failed).append(name)
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

def due_has(bill_id):
    s, d = req('GET', '/api/bills/due?days=0')
    ids = {b['id'] for b in (d.get('bills') or [])}
    return bill_id in ids

# 1. 空 payer 落库为 NULL
s, b = req('POST', '/api/bills', {
    'date': '2026-09-01T00:00:00+08:00', 'payee': '测试商户', 'payAmount': 10,
    'payer': '', 'isPaid': True, 'paidDate': '2026-09-05T00:00:00+08:00',
    'dedupeKey': 'e2e-empty-payer-1'})
check("POST 空 payer 返回 200", s == 200, f"{s} {b}")
bid = (b or {}).get('id')
check("POST 后 payer 读回为 None", (b or {}).get('payer') is None, f"payer={repr((b or {}).get('payer'))}")

# 2. 已付账单不得出现在 due
check("已付 + 空payer 不在 due 列表", not due_has(bid))

# 3. 未付账单（payee 正常）应在 due
s, b2 = req('POST', '/api/bills', {
    'date': '2026-09-02T00:00:00+08:00', 'payee': '测试商户B', 'payAmount': 20,
    'payer': '', 'isPaid': False, 'dedupeKey': 'e2e-empty-payer-2'})
bid2 = (b2 or {}).get('id')
check("未付 + 空payer 在 due 列表", due_has(bid2))

# 4. 真收款单未回填实收 → 在 due
s, r1 = req('POST', '/api/bills', {
    'date': '2026-09-03T00:00:00+08:00', 'payer': '测试租户', 'receiveAmount': 100,
    'isPaid': False, 'dedupeKey': 'e2e-receive-1'})
rid1 = (r1 or {}).get('id')
check("真收款单(未实收)在 due", due_has(rid1))

# 5. 真收款单已回填实收 → 不在 due
s, r2 = req('POST', '/api/bills', {
    'date': '2026-09-04T00:00:00+08:00', 'payer': '测试租户2', 'receiveAmount': 200,
    'actualReceiveAmount': 200, 'isPaid': True, 'dedupeKey': 'e2e-receive-2'})
rid2 = (r2 or {}).get('id')
check("真收款单(已实收)不在 due", not due_has(rid2))

# 6. PUT payer='' 也应归正为 NULL（更新语义）
s, u = req('PUT', f'/api/bills/{bid2}', {'payer': ''})
check("PUT 空 payer 读回 None", (u or {}).get('payer') is None, f"payer={repr((u or {}).get('payer'))}")

print(f"\n{len(passed)} passed, {len(failed)} failed")
sys.exit(1 if failed else 0)
