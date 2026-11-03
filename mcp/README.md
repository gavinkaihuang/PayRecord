# payrecord-mcp

PayRecord 的 MCP (Model Context Protocol) 服务器，stdio 传输，零依赖（Node ≥ 18）。
让 Hermes / Muse 等 agent 用统一工具读写账单，替代裸 HTTP 调用。

## 工具

| 工具 | 说明 | 需要的 scope |
|------|------|--------------|
| `list_due_bills` | 逾期 + N 天内到期的未付与未收账单（分待付/待收，daysUntilDue/overdue/各自合计），每日提醒用 | read |
| `list_bills` | 某年某月全部账单（默认当前月） | read |
| `add_bill` | 新建账单；payee 对照商户列表校验；支持 dedupeKey 幂等 | write |
| `mark_paid` | 标记已支付（还款，paidDate 默认 now） | write |
| `mark_received` | 标记已收款（房租/报销到账，回填 actualReceiveAmount） | write |
| `clone_bills` | 周期账单滚存（包含常规月度与季度/多月周期的房租） | write |
| `list_merchants` | 商户列表（add_bill 的 payee 白名单） | read |

## 环境变量

| 变量 | 说明 |
|------|------|
| `PAYRECORD_URL` | 服务地址。**生产必须用 HTTPS 域名**（如 `https://pay.wu2u.xyz`）——API key 走明文 8082 会被 PROXY_HEADER_SECRET 门禁 401 |
| `PAYRECORD_API_KEY` | 机器 key（`X-API-Key`）。明文只放本机环境变量，不进 Git |

## 接入 Claude Code

```bash
claude mcp add payrecord \
  --env PAYRECORD_URL=https://pay.wu2u.xyz \
  --env PAYRECORD_API_KEY=<key> \
  -- node /path/to/PayRecord/mcp/index.js
```

或项目级 `.mcp.json`：

```json
{
  "mcpServers": {
    "payrecord": {
      "command": "node",
      "args": ["/path/to/PayRecord/mcp/index.js"],
      "env": {
        "PAYRECORD_URL": "https://pay.wu2u.xyz",
        "PAYRECORD_API_KEY": "<key>"
      }
    }
  }
}
```

## 接入 Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "payrecord": {
      "command": "node",
      "args": ["/path/to/PayRecord/mcp/index.js"],
      "env": {
        "PAYRECORD_URL": "https://pay.wu2u.xyz",
        "PAYRECORD_API_KEY": "<key>"
      }
    }
  }
}
```

## 冒烟

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_due_bills","arguments":{"days":3}}}' \
| PAYRECORD_API_KEY=<key> node mcp/index.js
```

期望：第 3 行响应包含 5 个工具；第 4 行响应是到期账单摘要（或"无到期账单"）。

## 错误速查

- `HTTP 401`：key 错误，或 PAYRECORD_URL 用了明文 8082 绕过了 HTTPS 代理门禁。
- `HTTP 403`：key 缺少所需 scope（add_bill/mark_paid 需要 write）。
