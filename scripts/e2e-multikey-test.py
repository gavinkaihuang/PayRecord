#!/usr/bin/env python3
"""E2E for multi-key + scopes + dedupe + web-only guards. Run against local test server.
Keys are passed via env: PRK_HERMES / PRK_MUSE / PRK_RO (read-only)."""
import json, os, sys, urllib.request, urllib.error

BASE = "http://localhost:8082"
HERMES = os.environ['PRK_HERMES']
MUSE = os.environ['PRK_MUSE']
RO = os.environ['PRK_RO']

passed, failed = [], []

def req(method, path, body=None, headers=None):
    h = dict(headers or {})
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

HK = {'X-API-Key': HERMES}
MK = {'X-API-Key': MUSE}
RK = {'X-API-Key': RO}

# --- 1. all three keys authenticate ---
for label, hdr in [("hermes", HK), ("muse", MK), ("readonly", RK)]:
    s, d = req('GET', '/api/bills?year=2026&month=10', headers=hdr)
    check(f"{label} key -> 200", s == 200, f"{s} {d}")

s, d = req('GET', '/api/bills', headers={'X-API-Key': 'prk_wrong'})
check("bad key -> 401", s == 401, f"{s}")

# --- 2. scope enforcement ---
# readonly key cannot write
s, d = req('POST', '/api/bills', {'date': '2026-10-01', 'payee': 'X'}, headers=RK)
check("readonly POST bill -> 403", s == 403, f"{s} {d}")
# muse cannot delete
s, d = req('DELETE', '/api/bills?year=2026&month=10', headers=MK)
check("muse bulk DELETE -> 403", s == 403, f"{s} {d}")
# hermes can write and delete-scope exists
s, d = req('POST', '/api/bills', {'date': '2026-10-01T00:00:00+08:00', 'payee': '全量键测试', 'payAmount': 1}, headers=HK)
check("hermes POST bill -> 200", s == 200 and d.get('payee') == '全量键测试', f"{s} {d}")
hid = d['id'] if s == 200 else None

# --- 3. dedupeKey idempotency ---
dk = 'e2e-dedupe-001'
b = {'date': '2026-10-05T00:00:00+08:00', 'payee': '招商银行', 'payAmount': 1000,
     'notes': 'dedupe test', 'dedupeKey': dk}
s1, d1 = req('POST', '/api/bills', b, headers=MK)
check("muse create with dedupeKey -> 200, not duplicated", s1 == 200 and not d1.get('duplicated'), f"{s1} {d1}")
s2, d2 = req('POST', '/api/bills', b, headers=MK)
check("replay same dedupeKey -> duplicated:true, same id", s2 == 200 and d2.get('duplicated') is True and d2.get('id') == d1.get('id'), f"{s2} {d2}")
s3, d3 = req('GET', '/api/bills?year=2026&month=10', headers=MK)
cnt = len([x for x in d3 if x.get('payee') == '招商银行' and x.get('dedupeKey') == dk])
check("no duplicate rows in DB", cnt == 1, f"count={cnt}")
# a different dedupeKey still creates
s4, d4 = req('POST', '/api/bills', {**b, 'dedupeKey': 'e2e-dedupe-002'}, headers=MK)
check("different dedupeKey -> new row", s4 == 200 and not d4.get('duplicated') and d4['id'] != d1['id'], f"{s4}")
mid1, mid2 = d1['id'], d4['id']

# --- 4. muse CAN update bills (repayment flow) ---
s, d = req('PUT', f'/api/bills/{mid1}', {'isPaid': True, 'paidDate': '2026-10-06T09:00:00+08:00'}, headers=MK)
check("muse PUT mark paid -> 200", s == 200 and d.get('isPaid') is True, f"{s} {d}")
# muse CANNOT delete that bill
s, d = req('DELETE', f'/api/bills/{mid1}', headers=MK)
check("muse DELETE bill -> 403", s == 403, f"{s} {d}")
# hermes CAN delete
s, d = req('DELETE', f'/api/bills/{mid2}', headers=HK)
check("hermes DELETE bill -> 200", s == 200 and d.get('success') is True, f"{s} {d}")

# --- 5. web-only endpoints reject any valid machine key ---
for path, method, body in [
    ('/api/users/profile', 'GET', None),
    ('/api/users', 'GET', None),
    ('/api/telegram/test', 'POST', {'token': 'x', 'chatId': '1'}),
]:
    s, d = req(method, path, body, headers=HK)
    check(f"web-only {method} {path} (valid key) -> 403", s == 403, f"{s} {d}")
# bad key on web-only still 401 (not 403)
s, d = req('GET', '/api/users/profile', headers={'X-API-Key': 'prk_wrong'})
check("web-only bad key -> 401", s == 401, f"{s}")

# --- 6. actor stamped in logs ---
s, d = req('GET', '/api/logs', headers=HK)
actors = {l.get('actor') for l in d if l.get('action') in ('CREATE_BILL', 'UPDATE_BILL', 'DELETE_BILL')}
check("logs contain key:muse actor", 'key:muse' in actors, f"{actors}")
check("logs contain key:hermes actor", 'key:hermes' in actors, f"{actors}")

# --- 7. JWT web path unaffected ---
s, d = req('POST', '/api/auth/login', {'username': 'admin', 'password': 'admin123'})
check("web login -> 200", s == 200 and 'token' in d, f"{s}")
JWT = {'Authorization': f"Bearer {d.get('token','')}"}
s, d = req('GET', '/api/bills?year=2026&month=10', headers=JWT)
check("JWT GET bills -> 200", s == 200, f"{s}")
s, d = req('GET', '/api/users/profile', headers=JWT)
check("JWT profile (web-only ok) -> 200", s == 200, f"{s}")
s, d = req('POST', '/api/bills', {'date': '2026-10-08T00:00:00+08:00', 'payee': '网页写入', 'payAmount': 5}, headers=JWT)
check("JWT POST bill (no scope limit) -> 200", s == 200, f"{s} {d}")
if s == 200: wid = d['id']
s, d = req('GET', '/api/logs', headers=JWT)
check("logs contain user:admin actor", any(l.get('actor') == 'user:admin' for l in d), f"{[l.get('actor') for l in d[:5]]}")

# --- 8. clone via muse (write scope) works ---
s, d = req('POST', '/api/bills/clone', {'year': 2026, 'month': 10}, headers=MK)
check("muse clone -> 200", s == 200, f"{s} {d}")

# --- 9. revocation semantics: revoke readonly via script is out of HTTP scope; verified by --list/--revoke E2E in shell ---

# --- 10. GET /api/bills/due: overdue/soon flags, totals, filters, auth ---
from datetime import datetime, timedelta, timezone
SH = timezone(timedelta(hours=8))
def sh_iso(offset_days):
    return (datetime.now(SH) + timedelta(days=offset_days)).strftime('%Y-%m-%dT12:00:00+08:00')

def mkdue(dk, offset, amount, **kw):
    b = {'date': sh_iso(offset), 'payee': '京东', 'payAmount': amount, 'dedupeKey': dk}
    b.update(kw)
    return req('POST', '/api/bills', b, headers=MK)

for dk, off, amt in [('e2e-due-over', -1, 100), ('e2e-due-today', 0, 50),
                     ('e2e-due-soon', 2, 200), ('e2e-due-far', 5, 999)]:
    s, d = mkdue(dk, off, amt)
    check(f"seed due bill {dk} -> 200", s == 200, f"{s} {d}")
s, d = mkdue('e2e-due-nostats', 1, 70, includeInStats=False)
check("seed nostats bill -> 200", s == 200, f"{s} {d}")

s, d = req('GET', '/api/bills/due', headers=MK)
# local/test DBs carry other bills - assert only on the e2e-due-* subset
bydk = {b.get('dedupeKey'): b for b in d.get('bills', [])
        if str(b.get('dedupeKey', '')).startswith('e2e-due-')}
subset_sum = sum(b.get('payAmount') or 0 for b in bydk.values())
check("due default(3d) -> 200 with shape", s == 200 and 'totals' in d and 'asOf' in d, f"{s} {d}")
check("due default(3d) excludes +5d bill", 'e2e-due-far' not in bydk, f"{list(bydk)}")
check("due overdue flag & daysUntilDue=-1", bydk.get('e2e-due-over', {}).get('overdue') is True
      and bydk.get('e2e-due-over', {}).get('daysUntilDue') == -1, f"{bydk.get('e2e-due-over')}")
check("due today -> daysUntilDue=0", bydk.get('e2e-due-today', {}).get('daysUntilDue') == 0, f"{bydk.get('e2e-due-today')}")
check("due subset totals (4 bills, 1 overdue, sum 420)", len(bydk) == 4
      and sum(1 for b in bydk.values() if b['overdue']) == 1
      and abs(subset_sum - 420) < 1e-9, f"n={len(bydk)} sum={subset_sum}")
s, d = req('GET', '/api/bills/due?days=7', headers=MK)
bydk = {b.get('dedupeKey'): b for b in d.get('bills', [])
        if str(b.get('dedupeKey', '')).startswith('e2e-due-')}
check("due days=7 includes +5d bill (daysUntilDue=5)", 'e2e-due-far' in bydk
      and bydk['e2e-due-far']['daysUntilDue'] == 5, f"{list(bydk)}")
s, d = req('GET', '/api/bills/due?days=0', headers=MK)
bydk = {b.get('dedupeKey'): b for b in d.get('bills', [])
        if str(b.get('dedupeKey', '')).startswith('e2e-due-')}
check("due days=0 = overdue + today only", set(bydk) == {'e2e-due-over', 'e2e-due-today'}
      and bydk['e2e-due-over']['overdue'] is True
      and bydk['e2e-due-today']['overdue'] is False, f"{list(bydk)}")
s, d = req('GET', '/api/bills/due?days=abc', headers=MK)
bydk = {b.get('dedupeKey'): b for b in d.get('bills', [])
        if str(b.get('dedupeKey', '')).startswith('e2e-due-')}
check("due days=garbage falls back to 3", 'e2e-due-far' not in bydk and len(bydk) == 4, f"{list(bydk)}")
s, d = req('GET', '/api/bills/due?includeInStats=true', headers=MK)
bydk = {b.get('dedupeKey'): b for b in d.get('bills', [])
        if str(b.get('dedupeKey', '')).startswith('e2e-due-')}
check("due includeInStats=true excludes nostats bill", len(bydk) == 3
      and 'e2e-due-nostats' not in bydk
      and abs(sum(b.get('payAmount') or 0 for b in bydk.values()) - 350) < 1e-9, f"{list(bydk)}")
s, d = req('GET', '/api/bills/due', headers=RK)
check("readonly key GET due -> 200 (read scope)", s == 200, f"{s}")
s, d = req('GET', '/api/bills/due', headers={'X-API-Key': 'prk_wrong'})
check("bad key GET due -> 401", s == 401, f"{s}")
s, d = req('GET', '/api/bills/due')
check("no auth GET due -> 401", s == 401, f"{s}")
# paying a bill removes it from due
s, d = req('GET', '/api/bills/due', headers=MK)
soon_id = next((b['id'] for b in d['bills'] if b.get('dedupeKey') == 'e2e-due-soon'), None)
s, d = req('PUT', f'/api/bills/{soon_id}', {'isPaid': True, 'paidDate': sh_iso(0)}, headers=MK)
check("mark due bill paid -> 200", s == 200, f"{s} {d}")
s, d = req('GET', '/api/bills/due?includeInStats=true', headers=MK)
check("paid bill leaves due list", all(b.get('dedupeKey') != 'e2e-due-soon' for b in d.get('bills', [])), f"{[b.get('dedupeKey') for b in d.get('bills', [])]}")

# --- 10b. receive bills in due list & actualReceiveAmount settlement ---
s, d = req('POST', '/api/bills', {
    'date': sh_iso(1), 'payer': '新芦苑租客', 'receiveAmount': 5500,
    'notes': '季度房租', 'dedupeKey': 'e2e-recv-rent', 'isRecurring': True, 'recurringInterval': 3
}, headers=MK)
check("seed due receive bill (rent) -> 200", s == 200, f"{s} {d}")
s, d = req('GET', '/api/bills/due', headers=MK)
recv_items = [b for b in d.get('receiveBills', []) if b.get('dedupeKey') == 'e2e-recv-rent']
check("due returns receiveBills group", len(recv_items) == 1 and recv_items[0]['receiveAmount'] == 5500, f"{d.get('totals')}")
rent_id = recv_items[0]['id'] if recv_items else None
if rent_id:
    s, d = req('PUT', f'/api/bills/{rent_id}', {'actualReceiveAmount': 5500}, headers=MK)
    check("settle receive bill (actualReceiveAmount) -> 200", s == 200, f"{s} {d}")
s, d = req('GET', '/api/bills/due', headers=MK)
check("received rent leaves due list", all(b.get('dedupeKey') != 'e2e-recv-rent' for b in d.get('receiveBills', [])), f"{[b.get('dedupeKey') for b in d.get('receiveBills', [])]}")

# --- 10c. quarterly clone verification ---
# Seed a bill in month M-3 with recurringInterval=3
from datetime import datetime as _dt
now_dt = _dt.now(SH)
m3_year = now_dt.year if now_dt.month > 3 else now_dt.year - 1
m3_month = now_dt.month - 3 if now_dt.month > 3 else now_dt.month + 9
m3_date = f"{m3_year}-{m3_month:02d}-15T10:00:00+08:00"
s, d = req('POST', '/api/bills', {
    'date': m3_date, 'payer': '绿地海怡租客', 'receiveAmount': 6000,
    'notes': '季度克隆测试', 'dedupeKey': 'e2e-q-clone-seed', 'isRecurring': True, 'recurringInterval': 3
}, headers=MK)
check("seed quarterly recurring bill (M-3) -> 200", s == 200, f"{s} {d}")
# Clone from prev month to current month
prev_y = now_dt.year if now_dt.month > 1 else now_dt.year - 1
prev_m = now_dt.month - 1 if now_dt.month > 1 else 12
s, d = req('POST', '/api/bills/clone', {'year': prev_y, 'month': prev_m}, headers=MK)
check("clone from prev month to current -> 200", s == 200, f"{s} {d}")
# Verify quarterly rent bill was cloned into current month
s, d = req('GET', f"/api/bills?year={now_dt.year}&month={now_dt.month}", headers=MK)
q_cloned = [b for b in d if b.get('payer') == '绿地海怡租客']
check("quarterly bill cloned into current month", len(q_cloned) >= 1 and q_cloned[0]['recurringInterval'] == 3, f"{q_cloned}")

# --- 11. profile telegramToken masking (T4) ---
s, d = req('PUT', '/api/users/profile', {'telegramToken': '123456789:AAHfake-token-for-e2e'}, headers=JWT)
check("profile PUT set token -> 200", s == 200, f"{s} {d}")
s, d = req('GET', '/api/users/profile', headers=JWT)
tok = d.get('telegramToken')
check("profile GET returns masked token", isinstance(tok, str) and '…' in tok
      and 'AAHfake' not in tok, f"{tok}")
s, d = req('PUT', '/api/users/profile', {'telegramToken': tok}, headers=JWT)  # echo the mask back
s2, d2 = req('GET', '/api/users/profile', headers=JWT)
check("masked echo does not overwrite stored token", d2.get('telegramToken') == tok, f"{d2.get('telegramToken')}")
s, d = req('PUT', '/api/users/profile', {'telegramToken': None}, headers=JWT)
s3, d3 = req('GET', '/api/users/profile', headers=JWT)
check("clearing token works (reads null after)", s == 200 and d3.get('telegramToken') is None, f"{s} {d3.get('telegramToken')}")

# cleanup test bills via hermes (delete scope)
s, d = req('GET', '/api/bills?year=2026&month=10', headers=HK)
for b in d:
    if b.get('payee') in ('全量键测试', '网页写入') or str(b.get('dedupeKey', '')).startswith('e2e-'):
        req('DELETE', f"/api/bills/{b['id']}", headers=HK)
# due-seeded bills may fall in the current month, not 2026-10
from datetime import datetime as _dt
s, d = req('GET', f"/api/bills?year={_dt.now(SH).year}&month={_dt.now(SH).month}", headers=HK)
for b in d:
    if str(b.get('dedupeKey', '')).startswith('e2e-') or b.get('payer') in ('绿地海怡租客', '新芦苑租客'):
        req('DELETE', f"/api/bills/{b['id']}", headers=HK)

print(f"\n{len(passed)} passed, {len(failed)} failed")
if failed:
    print("FAILED:", failed); sys.exit(1)
