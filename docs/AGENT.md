# Agent 接入指南（Hermes / Muse）

给外部 agent（Hermes、Muse 等）读写 PayRecord 的最短路径。人类操作流程见网页设置页与 `API.md`。

## 连接

| 项 | 值 |
|----|----|
| 服务地址 | `https://pay.wu2u.xyz`（**勿用明文 8082**：机器 key 走 8082 会被 PROXY_HEADER_SECRET 门禁直接 401） |
| 认证 | `X-API-Key: <key>` 请求头；key 由服务器 `scripts/generate-api-key.js` 发放 |
| 推荐 MCP | `mcp/`（见 `mcp/README.md`），工具齐全且带校验 |

## key 策略（一 agent 一把）

| agent | scopes | 用途 |
|-------|--------|------|
| hermes | read,write,delete | 全量：记账、改账、清理 |
| muse | read,write | 只能记账/标记支付，不能删除 |
| 只读报表 | read | 只看不动 |

发放（服务器上，明文只显示一次）：

```bash
node scripts/generate-api-key.js <username> --name muse --scopes read,write
node scripts/generate-api-key.js <username> --list    # 核对
node scripts/generate-api-key.js <username> --revoke muse   # 泄漏秒吊销
```

## 记账口径（重要）

- **金额 0 是合法值**；`null`/缺省才是"未填"。出账单前金额未知，先建空金额条目。
- **dedupeKey 幂等**：agent 自动记账必带唯一 dedupeKey，重试/补发不会记双份，响应含 `duplicated:true` 表示命中已有账单。
- **includeInStats**：信用卡还款类备忘账单设 `false`（避免与消费重复统计）；真实收支 `true`（默认）。
- **周期账单**：月初 clone 生成（`isRecurring=true`），出账单后回填金额，还款后 `mark_paid`。
- **payee 拼写**：`add_bill` 会对照商户列表校验，拼错会报错并列出可选项（防图标与统计口径漂移）。

## 每日提醒提示词（建议）

给常驻 agent 的定时任务提示词参考：

> 每天早上调用 `list_due_bills(days=3)`。有逾期（🔴）立即提醒我还款；临近到期的汇总成一条消息报给我；
> 金额未填的条目提醒我确认。若我说"已还 XX"，用 `mark_paid` 标记对应账单（先 `list_due_bills` 找到 id）。

Telegram cron（`scripts/cron-telegram-notify.js`）是同一逻辑的兜底通道：agent 不在线时每天仍会推一条汇总。

## 常见错误

| 现象 | 原因 |
|------|------|
| 401 | key 错误 / 已吊销 / 走了明文 8082 |
| 403 `lacks required scope` | key 权限不够（如 muse key 调 DELETE） |
| 403 `web-only` | 账户/凭证类接口（改密码、TG 绑定）只允许网页 JWT，agent 不许碰 |
| 月份查出来差一天 | 日期没带 `+08:00`；按月/到期边界一律按上海时区算 |
