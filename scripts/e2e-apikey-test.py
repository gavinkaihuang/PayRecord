#!/usr/bin/env python3
"""E2E test for PayRecord API-key auth + core bill flows. Run against local test server."""
import json, urllib.request, urllib.error, sys

BASE = "http://localhost:8082"
KEY = open('/tmp/prk.txt').read().strip().splitlines()[-1]

passed, failed = [], []

def req(method, path, body=None, headers=None, raw=False):
    h = dict(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h['Content-Type'] = 'application/json'
    r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            t = resp.read().decode()
            return resp.status, (t if raw else (json.loads(t) if t else None))
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t

def check(name, cond, detail=""):
    (passed if cond else failed).append(name)
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

AK = {'X-API-Key': KEY}

# --- auth ---
s, d = req('GET', '/api/bills?year=2026&month=10', headers=AK)
check("API key auth -> 200", s == 200, f"{s} {d}")

s, d = req('GET', '/api/bills', headers={'X-API-Key': 'prk_wrongkey'})
check("bad API key -> 401", s == 401, f"{s}")

s, d = req('GET', '/api/bills')
check("no auth -> 401", s == 401, f"{s}")

# JWT still works alongside
s, d = req('POST', '/api/auth/login', {'username': 'admin', 'password': 'admin123'})
check("login -> 200 + token", s == 200 and 'token' in d, f"{s}")
JWT = {'Authorization': f"Bearer {d.get('token','')}"}
s, d = req('GET', '/api/bills?year=2026&month=10', headers=JWT)
check("JWT auth still works", s == 200, f"{s}")

# bad API key must NOT fall through to a valid JWT in same request
s, d = req('GET', '/api/bills', headers={'X-API-Key': 'prk_wrong', **JWT})
check("bad key + valid JWT -> 401 (no fallthrough)", s == 401, f"{s}")

# --- core Hermes flow: 还招行1000 ---
bill1 = {'date': '2026-10-20T00:00:00+08:00', 'payee': '招商银行', 'payAmount': 1000,
         'notes': '信用卡还款', 'isRecurring': True, 'includeInStats': False}
s, d = req('POST', '/api/bills', bill1, headers=AK)
check("create bill via API key", s == 200 and d.get('payee') == '招商银行', f"{s} {d}")
id1 = d['id']
check("create: isPaid default false, paidDate null", d.get('isPaid') is False and d.get('paidDate') is None)

# zero-amount bug fix (old code: 0 -> null)
bill0 = {'date': '2026-10-21T00:00:00+08:00', 'payee': '测试零金额', 'payAmount': 0}
s, d = req('POST', '/api/bills', bill0, headers=AK)
check("payAmount=0 preserved (bug fix)", s == 200 and d.get('payAmount') == 0, f"{s} {d}")
id0 = d['id']

# list & find unpaid 招商银行
s, d = req('GET', '/api/bills?year=2026&month=10', headers=AK)
unpaid = [b for b in d if b['payee'] == '招商银行' and not b['isPaid']]
check("list month bills, find unpaid 招行", s == 200 and len(unpaid) == 1, f"{s} n={len(unpaid)}")

# mark paid — THE flow: "今天我还了招行1000"
s, d = req('PUT', f'/api/bills/{id1}', {'isPaid': True, 'paidDate': '2026-10-15T10:30:00+08:00'}, headers=AK)
check("mark paid (isPaid+paidDate)", s == 200 and d.get('isPaid') is True and d.get('paidDate', '').startswith('2026-10-15'), f"{s} {d}")
check("partial update keeps payAmount=1000", d.get('payAmount') == 1000)

# PUT with 0 amount also preserved
s, d = req('PUT', f'/api/bills/{id0}', {'payAmount': 0}, headers=AK)
check("PUT payAmount=0 preserved", s == 200 and d.get('payAmount') == 0, f"{s} {d}")

# --- clone: recurring 招行 bill -> Nov, amount must reset to null, unpaid ---
s, d = req('POST', '/api/bills/clone', {'year': 2026, 'month': 10}, headers=AK)
check("clone via API key", s == 200 and d.get('clonedCount', 0) >= 1, f"{s} {d}")
s, d = req('GET', '/api/bills?year=2026&month=11', headers=AK)
nov = [b for b in d if b['payee'] == '招商银行']
check("Nov clone exists, amount null, unpaid", len(nov) == 1 and nov[0]['payAmount'] is None and nov[0]['isPaid'] is False, f"{nov}")

# --- secondary endpoints ---
s, d = req('GET', '/api/merchants', headers=AK)
check("merchants GET", s == 200 and isinstance(d, list), f"{s}")
s, d = req('POST', '/api/merchants', {'name': '招商银行', 'icon': '/api/uploads/icons/test.png'}, headers=AK)
check("merchants POST upsert", s == 200 and d.get('name') == '招商银行', f"{s} {d}")
s, d = req('GET', '/api/logs', headers=AK)
acts = [l['action'] for l in d]
check("logs record API-key actions", s == 200 and 'UPDATE_BILL' in acts and 'CLONE_BILLS' in acts, f"{acts[:6]}")
s, d = req('GET', '/api/users', headers=AK)
check("users GET", s == 200 and isinstance(d, list), f"{s}")

# calendar (no auth by design)
s, d = req('GET', f'/api/calendar/6b3aab08-fa6d-4e77-a09f-cf6a7c57a5a6', raw=True)
check("calendar ICS (unauthenticated, by design)", s == 200 and 'BEGIN:VCALENDAR' in d, f"{s}")

print(f"\n{len(passed)} passed, {len(failed)} failed")
if failed:
    print("FAILED:", failed); sys.exit(1)
