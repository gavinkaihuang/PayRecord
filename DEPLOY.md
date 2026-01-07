# Deploying PayRecord to Production

## Prerequisites
1.  Ensure **Node.js** (v18+) is installed.
2.  Ensure source code is pulled to the server.
3.  Ensure `.env` file is created and configured (see README).

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
3.  `npx prisma db push` (if schema changed)
4.  `npm run build`
5.  `pm2 restart pay-record`
