# Hermes 接入 PayRecord MCP —— 自助配置说明

> 给 Hermes（运行在 UM690 的 hermes 用户下）自己读、自己执行。
> 通用背景见 `docs/AGENT.md`，工具清单见 `mcp/README.md`。

## 目标
把 PayRecord 的 MCP server 注册到你（Hermes）的 MCP 配置里，使你能调用：
`list_due_bills`、`list_bills`、`add_bill`、`mark_paid`、`list_merchants`。

## 前置条件（先逐项自检，不满足就停下来告诉用户）
1. `node --version` ≥ 18。
2. 能访问线上服务：`curl -s -o /dev/null -w "%{http_code}\n" https://pay.wu2u.xyz/login` 返回 200（不返回就是网络问题，停下报告）。
3. 有 PayRecord 仓库副本（MCP 依赖仓库内的 `lib/due-date.js`，不能只拷 `mcp/index.js`）。

## 步骤

### 1. 获取代码（只读使用，不要修改仓库）
```bash
# 路径可自选，示例：
git clone git@github.com:gavinkaihuang/PayRecord.git ~/PayRecord
cd ~/PayRecord && git checkout main && git pull
```
需要的文件：`mcp/index.js`、`lib/due-date.js`。MCP 零依赖，**不需要 npm install**。
如果没有该仓库的访问权限，停下来请用户处理，不要自行寻找凭证。

### 2. API key —— 由用户提供，你不要自己生成
- 向用户索要 hermes 的 API key（`prk_` 开头，全权限 read/write/delete）。
- 存放：写进只有你能读的文件，权限 600，例如 `~/.config/payrecord/env`：
  ```bash
  mkdir -p ~/.config/payrecord && chmod 700 ~/.config/payrecord
  umask 077
  cat > ~/.config/payrecord/env <<'EOF'
  PAYRECORD_URL=https://pay.wu2u.xyz
  PAYRECORD_API_KEY=<由用户提供的 key>
  EOF
  ```
- **禁止**：把 key 写进任何 Git 仓库、日志、聊天回复、记忆文件或提示词；回显 key；上传到任何第三方。
- `PAYRECORD_URL` **必须是 `https://pay.wu2u.xyz`**。不要用 `http://…:8082`，直连会被网关门禁 401。

### 3. 注册 MCP server
用你自己的 MCP 配置机制，注册一个 **stdio** 类型的 server，规格如下：

| 字段 | 值 |
|---|---|
| name | `payrecord` |
| transport | stdio |
| command | `node` |
| args | `["<PayRecord 仓库绝对路径>/mcp/index.js"]` |
| env | `PAYRECORD_URL=https://pay.wu2u.xyz`、`PAYRECORD_API_KEY=<从上面的 env 文件读取>` |

通用 JSON 形态（字段名以你自己的配置格式为准）：
```json
{
  "mcpServers": {
    "payrecord": {
      "command": "node",
      "args": ["/绝对路径/PayRecord/mcp/index.js"],
      "env": {
        "PAYRECORD_URL": "https://pay.wu2u.xyz",
        "PAYRECORD_API_KEY": "<从 env 文件注入，不要明文写进配置>"
      }
    }
  }
}
```
改你自己的配置文件之前，先备份原文件（加时间戳后缀）。配置完成后按你的方式重载/重启 MCP 连接。

### 4. 验证（按顺序，全部通过才算完成）
1. 工具列表里能看到 5 个工具。
2. 调 `list_merchants` → 返回商户名称列表。
3. 调 `list_due_bills`（`days=3`）→ 返回「截至 YYYY-MM-DD…逾期 N 笔、临近 N 笔」。
4. **不要用真实数据测试写入**。如需验证写入，先问用户；允许的话用一条明显的测试账单（`notes` 写 `hermes-onboard-test`，带 `dedupeKey`），验证后让用户确认是否保留或删除。

### 5. 报告
向用户汇报：node 版本、仓库路径、配置文件位置、第 4 步各项结果。**报告里不要出现 key。**

## 出错对照
| 现象 | 原因与处理 |
|---|---|
| `cannot reach …` | 网络问题；确认 `PAYRECORD_URL` 域名可达 |
| `HTTP 401` | key 错误/已吊销，或 URL 用了 8082；找用户确认 |
| `HTTP 403 … scope` | key 权限不足；找用户换 key，不要自行绕过 |
| `Cannot find module '../lib/due-date'` | 只拷了 `mcp/` 没拷 `lib/`；用完整仓库副本 |
| `PAYRECORD_API_KEY is not set` | env 没注入到 MCP 进程 |

## 日常使用约定
- 每日提醒：每天早上调 `list_due_bills(days=3)`，逾期立即提醒用户，临近到期汇总成一条，金额未填的提醒用户确认。
- 用户说「已还 XX」：先 `list_due_bills` 找到账单 id，再 `mark_paid`。
- 自动记账必须带唯一 `dedupeKey`（重试不会记双份）；`payee` 必须来自商户列表。
- 信用卡还款类备忘账单 `includeInStats=false`。
- 遇到 `web-only` 的 403：这类接口（改密码、Telegram 绑定）不允许 agent 调用，不要尝试绕过。
