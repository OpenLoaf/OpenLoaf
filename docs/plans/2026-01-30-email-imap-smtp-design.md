# 邮件功能方案（Email v1）

## 目标与范围
首版实现通用 IMAP/SMTP 收发邮件，使用应用专用密码；支持多 workspace 的邮箱账号管理与邮件展示。账号配置与同步状态写入 workspace 根目录的 `email.json`，密码写入 `apps/server/.env`，邮件缓存落库到 SQLite（DB 可重置且能重建）。

## 存储设计

### email.json（集中存放账号与同步状态）
路径：`<workspaceRoot>/email.json`

```json
{
  "emailAccounts": [
    {
      "emailAddress": "xxx@company.com",
      "label": "工作邮箱",
      "imap": { "host": "imap.xxx.com", "port": 993, "tls": true },
      "smtp": { "host": "smtp.xxx.com", "port": 465, "tls": true },
      "auth": {
        "type": "password",
        "envKey": "EMAIL_PASSWORD__{workspaceId}__xxx_company_com"
      },
      "sync": {
        "mailboxes": {
          "INBOX": { "uidValidity": 123, "highestUid": 4567 }
        }
      },
      "status": { "lastSyncAt": "2026-01-30T12:00:00Z", "lastError": null }
    }
  ]
}
```

说明：
- `email.json` 放在 workspace 根目录下，因此不再包含 workspace 包裹层级。
- `envKey` 仍建议包含 `workspaceId`，用于避免多 workspace 场景下的环境变量冲突。

### .env（保存密码）
命名规则：
```
EMAIL_PASSWORD__{workspaceId}__{emailSlug}
```
- `emailSlug` = email 全小写，非字母数字替换成 `_`
- 示例：`foo.bar@xx.com` → `foo_bar_xx_com`

### 数据库（仅 1 张表）
```prisma
model EmailMessage {
  id           String   @id
  workspaceId  String
  accountEmail String
  mailboxPath  String
  uid          Int

  messageId    String?
  subject      String?
  from         Json
  to           Json
  cc           Json?
  bcc          Json?
  date         DateTime?
  flags        Json?
  snippet      String?

  bodyHtml     String?
  bodyText     String?
  attachments  Json?
  rawRfc822    String?

  size         Int?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([workspaceId, accountEmail, mailboxPath, uid])
  @@index([workspaceId, accountEmail, date])
}
```

附件文件建议落盘：`apps/server/workspace/<workspaceId>/email-attachments/...`，DB 仅存元信息。

## 服务端模块设计

### 目录建议
```
apps/server/src/modules/email/
  emailConfigStore.ts   // 读写 email.json
  emailEnvStore.ts      // 读写 .env 密码
  imapSyncService.ts
  smtpSendService.ts
  mailParser.ts         // mailparser + sanitize-html
```

### API 清单
- `listEmailAccounts(workspaceId)`
- `addEmailAccount(payload)`
- `updateEmailAccount(payload)`
- `deleteEmailAccount(payload)`
- `testEmailConnection(payload)`
- `syncEmailAccount(workspaceId, emailAddress)`
- `listMessages(query)`
- `getMessage(id)`
- `sendMessage(payload)`

注意：前端永远不接触密码，密码只在 server 写 `.env`。

## 同步策略
- 初次同步：按“最近 N 封 / N 天”拉取
- 增量同步：`UID FETCH (highestUid+1:*)`
- `uidValidity` 变化 → 清空该 mailbox DB 记录并重建
- 轮询同步：每 2–5 分钟；支持手动刷新
- 同步加锁，避免同账号并发拉取
- 同步状态写回 `email.json`：`lastSyncAt` / `lastError`

## 发送策略
- `nodemailer` 发信 → SMTP
- 成功后 IMAP `APPEND` 写入 Sent
- 失败时记录错误并返回前端提示

## 渲染与安全
- 解析：`mailparser` 生成 `html/text`
- 清洗：`sanitize-html` 过滤 script/iframe/on* 属性
- 存储：`bodyHtml` 为清洗后 HTML，`bodyText` 为纯文本
- 前端只渲染安全 HTML（`dangerouslySetInnerHTML`）
- CID 图片替换为本地 attachment URL
- 列表使用 `snippet`（纯文本摘要）

## 前端 EmailPage（功能完善）
- 顶部：账号切换、同步状态、搜索、写信
- 左侧：账号列表 + folder 列表 + 未读数
- 中间：邮件列表（未读标识、摘要、时间）
- 右侧：邮件详情 + 附件 + 快速操作
- 添加邮箱：弹窗 → 测试连接 → 保存
- 写信：抽屉/弹窗，支持附件上传

## 落地步骤
1) 新增 `email.json` 读写工具（带锁 + 原子写）
2) 新增 `.env` 密码写入逻辑
3) Prisma 表迁移（EmailMessage）
4) 实现 IMAP 同步服务
5) 实现 SMTP 发送服务
6) 实现 API 层
7) 前端 EmailPage 接入闭环（正文优先使用 `bodyHtml`）
8) 增加同步错误提示与重试策略
