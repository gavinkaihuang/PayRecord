# Deploying PayRecord to Production

> **推荐路径**：用 `scripts/deploy.sh`（check / backup / upgrade / rollback / genkey 一应俱全，
> 默认部署 `main` 分支）。数据库结构一律走 `npx prisma db push`——线上库从未初始化
> `_prisma_migrations` 表，**禁止 `prisma migrate deploy`**。以下手工步骤是脚本不可用时的备用路线。

## Prerequisites
1.  Ensure **Node.js** (v18+) is installed.
2.  Ensure source code is pulled to the server.
3.  Ensure `.env` file is created and configured (see README).
4.  Ensure `.env` has a strong `JWT_SECRET` (`openssl rand -hex 32`).
    Since the boot-guard change, a production server **refuses to start** with the
    default/missing secret instead of silently issuing forgeable tokens.

## Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Update Database Schema
```bash
npx prisma db push
```

### 3. Build Application
This compiles the TypeScript code and optimizes it for production.
```bash
npm run build
```

### 4. Start Application

#### Option A: Simple Start (Foreground)
Running this way will stop the app if you close the terminal.
```bash
npm start
```
*App will run on port 3000 by default.*

#### Option B: Using PM2 (Recommended for Production)
PM2 ensures the app keeps running in the background and restarts if it crashes.

1.  **Install PM2** (Global):
    ```bash
    npm install -g pm2
    ```

2.  **Start the App**:
    ```bash
    pm2 start npm --name "pay-record" -- start
    ```

3.  **Save Process List** (so it survives reboots):
    ```bash
    pm2 save
    ```

4.  **Manage App**:
    - View logs: `pm2 logs pay-record`
    - Restart: `pm2 restart pay-record`
    - Stop: `pm2 stop pay-record`

## Updates
When you have new code changes:
1.  `git pull`
2.  `npm install`
3.  `npx prisma db push` (if schema changed) — never `migrate deploy` on this server
4.  `npm run build`
5.  `pm2 restart pay-record`

Related ops: agent/MCP integration lives in `mcp/` + `docs/AGENT.md`;
the daily Telegram reminder cron is `node scripts/cron-telegram-notify.js`
(`--dry-run` to preview, `CRON_DUE_DAYS` to tune the look-ahead window).
