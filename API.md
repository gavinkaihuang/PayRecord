# PayRecord API 文档

全部对外暴露的 HTTP 接口清单与调用规范。服务默认监听 `0.0.0.0:8082`（`npm start`）。

## 认证

支持两种方式，任选其一：

| 方式 | 请求头 | 适用场景 | 有效期 |
|------|--------|----------|--------|
| API Key | `X-API-Key: prk_xxx` | 机器/脚本/Agent 长期调用 | 长期，手动轮换 |
| JWT | `Authorization: Bearer <token>` | 网页端 | 24 小时 |

规则：

- 两种头同时存在时，以 `X-API-Key` 为准；key 无效则直接 401，**不会**回退到 JWT。
- 未认证或认证失败统一返回 `401 {"error":"Unauthorized"}`。
- API Key 只存 bcrypt 哈希（`User.apiKeyHash`），明文仅在生成时打印一次。

### API Key 管理（服务器命令行）

```bash
node scripts/generate-api-key.js <username>            # 生成/轮换，打印明文一次
node scripts/generate-api-key.js <username> --remove   # 吊销
```

## 通用约定

- 请求/响应体均为 JSON（upload 接口除外）。
- 金额字段为数字；传 `0` 是合法值，传 `null`/缺省表示"未填"。空字符串视为未填。
- 日期用 ISO 8601，**建议带 +08:00 时区偏移**（如 `2026-10-15T10:30:00+08:00`）；按月查询的边界按服务器本地时区（TZ=Asia/Shanghai）计算。
- 业务错误返回 4xx/5xx + `{"error":"..."}`；未指明 `userId` 的接口一律按认证身份隔离数据，无法跨用户读写。

## 数据模型（Bill）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(uuid) | 主键 |
| date | DateTime | 账单日期（到期日） |
| payee | string? | 待支付方（如"招商银行"） |
| payAmount | float? | 待付金额（出账单后填写；克隆到下月时重置为 null） |
| isPaid | bool | 是否已支付 |
| paidDate | DateTime? | 实际支付日期 |
| payer | string? | 待收款方 |
| receiveAmount | float? | 待收款金额 |
| actualReceiveAmount | float? | 实收金额（填写即视为收款完成） |
| notes | string? | 备忘录（消费原因、购买物件等） |
| isRecurring | bool | 是否周期账单（克隆到下月的依据） |
| recurringInterval | int | 周期（月），1=每月；>1 的不参与克隆 |
| includeInStats | bool | 是否计入收支统计（信用卡刷卡笔记=false，还款时=true，避免重复计算） |

---

## 接口清单

### 1. POST /api/auth/login

登录换取 JWT。请求体 `{username, password}`。成功 `200 {token, user:{id, username}}`；账密错误 401。

```bash
curl -X POST http://host:8082/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"gavin","password":"***"}'
```

### 2. GET /api/bills?year=YYYY&month=M

按月查询当前用户账单（缺省年月=当月）。返回 Bill 数组（附 `payeeIcon`/`payerIcon` 字段），按 date 升序。注意：**不支持按 payee/isPaid 过滤**，调用方自行在结果中筛选。

```bash
curl -H "X-API-Key: $KEY" 'http://host:8082/api/bills?year=2026&month=10'
```

### 3. POST /api/bills

创建账单。请求体为 Bill 可写字段（见上表），`date` 必填。返回创建后的完整 Bill。

```bash
curl -X POST http://host:8082/api/bills -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"date":"2026-10-15T00:00:00+08:00","payee":"京东","payAmount":2999,"notes":"显示器","includeInStats":true}'
```

### 4. PUT /api/bills/{id}

更新账单，**部分更新**：请求体里出现哪个字段就改哪个，未出现的字段保持不变（`payAmount: 0` 与 `payAmount: null` 均为显式赋值）。返回更新后的完整 Bill。典型用法——记录还款：

```bash
curl -X PUT http://host:8082/api/bills/<id> -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"isPaid":true,"paidDate":"2026-10-15T10:30:00+08:00"}'
```

### 5. DELETE /api/bills/{id}

删除单条。返回 `{success:true}`。

### 6. DELETE /api/bills?year=YYYY&month=M

按月批量删除（危险操作）。year、month 必填。返回 `{deletedCount}`。

### 7. POST /api/bills/clone

把指定月 `isRecurring=true` 且 `recurringInterval=1` 的账单克隆到下月。请求体 `{year, month}`（源月）。

克隆规则：金额字段（payAmount/receiveAmount）重置为 null；isPaid/paidDate/actualReceiveAmount 重置；目标月已存在同 payee+payer 的**未编辑**条目则先删后建，**已编辑**（已付或已填实收）的跳过不覆盖。返回 `{clonedCount, deletedCount, skippedCount}`。

### 8. GET /api/merchants

商户列表 = 全部已配置商户（全局）∪ 当前用户账单中出现过的 payee/payer。返回 `[{name, icon}]`，按名称排序。调用方应以此列表中的名称为标准商户名（新账单的 payee 从这里取，保证克隆去重可靠）。

### 9. POST /api/merchants

新增/更新商户（全局生效）。请求体 `{name, icon}`（icon 为上传接口返回的 URL）。upsert 语义。

### 10. DELETE /api/merchants?name=xxx

删除商户配置（图标重置）。商户仅存在于配置表时才可删，账单文本不受影响。

### 11. GET /api/logs

当前用户最近 100 条操作日志 `{id, action, details, ip, createdAt}`。action 枚举：LOGIN / CREATE_BILL / UPDATE_BILL / DELETE_BILL / BULK_DELETE_BILLS / CLONE_BILLS / UPDATE_MERCHANT_ICON / DELETE_MERCHANT / UPDATE_PROFILE。

### 12. GET /api/users

全部用户列表 `{id, username, createdAt}`（不含密码等敏感字段）。

### 13. POST /api/users

创建用户 `{username, password}`。用户名重复返回 400。

### 14. GET /api/users/profile

当前用户资料 `{id, username, nickname, telegramToken, telegramChatId}`。

### 15. PUT /api/users/profile

更新资料 `{nickname?, password?, telegramToken?, telegramChatId?}`。

### 16. POST /api/telegram/test

发送 Telegram 测试消息 `{token, chatId}`（token 为 Bot token）。

### 17. POST /api/upload

上传文件（multipart/form-data，字段名 `file`），存到 `public/uploads/icons/`。返回 `{url}`，该 url 用作 merchants 的 icon。

### 18. GET /api/calendar/{userId} （无鉴权）

ICS 日历订阅，当月起全部账单。**无认证**（日历客户端不便带凭证，userId 本身即秘密）——因此 userId 不要外传；如泄漏可在数据库层面更换（uuid 变更后旧链接失效）。

### 19. GET /api/uploads/icons/{filename} （无鉴权）

静态图标文件。仅存放商户图标，不含敏感数据。

## 服务器运维接口之外的暴露面

- `/login` `/dashboard` `/settings` `/users` `/api-tester` 为网页页面路由，非 API。
- `scripts/cron-telegram-notify.js` 为出站任务（服务器 → Telegram），不监听端口。

## 升级步骤（v1.3 - API Key 认证）

1. 备份数据库：`cp prisma/dev.db prisma/dev.db.bak.$(date +%Y%m%d)`
2. `git pull`（或 `git am` 补丁）
3. `npm install`
4. `npx prisma db push`（User 表新增可空列 `apiKeyHash`，非破坏性，无数据风险）
5. `npm run build && pm2 restart payrecord`
6. `node scripts/generate-api-key.js <你的用户名>` 生成 API Key（明文只显示一次，妥善保存）
