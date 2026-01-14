This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


测试接口：
http://localhost:3000/api-tester


1、设置定时任务 (Cron Job)
请在您的服务器上执行以下步骤以启用每天早上 8 点的自动提醒：

打开 Crontab 编辑器:
bash
crontab -e
添加以下行 (请根据实际路径修改):
cron
0 8 * * * /usr/bin/node /home/ubuntu/source/PayRecord/scripts/cron-telegram-notify.js >> /home/ubuntu/source/PayRecord/logs/cron.log 2>&1
注意：请确保 logs 目录存在，如果不存在请先创建：mkdir -p logs
保存并退出。
现在每天早上 8 点，系统会自动检查并发送提醒。您可以手动运行 node scripts/cron-telegram-notify.js 来测试效果。


2、重置密码脚本已生成: scripts/reset-password.js

使用方法:

bash
node scripts/reset-password.js <用户名>
例如，重置用户 gavin 的密码:

bash
node scripts/reset-password.js gavin
这将把密码重置为 gavin123。

注意: 若在服务器上运行，请确保您在项目根目录下。

3、服务器升级说明 (v1.1 - Global Merchant Icons)

如果您正在从旧版本升级，请按照以下步骤操作：

1. **拉取最新代码**
   在项目根目录下运行：
   ```bash
   git pull
   ```

2. **数据库迁移 (重要)**
   本次更新将商户图标改为全局共享，会删除 `Merchant` 表中的 `userId` 字段。
   **注意**: 现有的商户图标配置可能会丢失关联，或者如果存在同名商户可能会导致冲突。建议先备份数据库 (`prisma/dev.db`)。

   应用更改：
   ```bash
   npx prisma db push
   ```
   如果提示有数据丢失风险，请输入 `y` 确认。

3. **重新构建**
   更新依赖并重新构建应用：
   ```bash
   npm install
   npm run build
   ```

4. **重启服务**
   假设您使用 PM2 管理进程：
   ```bash
   pm2 restart payrecord
   ```
   或者如果您直接运行：
   Ctrl+C 停止当前进程，然后重新运行 `npm start`。


日历订阅：
You can now subscribe to this calendar on your iPhone using the URL format: https://<your-domain>/api/calendar/<your-user-id>