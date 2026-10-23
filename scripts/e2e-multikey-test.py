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

# cleanup test bills via hermes (delete scope)
s, d = req('GET', '/api/bills?year=2026&month=10', headers=HK)
for b in d:
    if b.get('payee') in ('全量键测试', '网页写入') or b.get('dedupeKey', '').startswith('e2e-dedupe'):
        req('DELETE', f"/api/bills/{b['id']}", headers=HK)

print(f"\n{len(passed)} passed, {len(failed)} failed")
if failed:
    print("FAILED:", failed); sys.exit(1)
