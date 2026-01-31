# Email Add-Account Immediate Sync Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增邮箱账号后立即同步 INBOX 最近 50 封邮件（正文优先 `bodyHtml`），同步结果写入数据库并更新 `email.json` 状态。

**Architecture:** 在 `apps/server/src/modules/email` 新增 IMAP 同步服务，基于 node-imap + mailparser + sanitize-html；`emailRouter.addAccount` 在写入账号后触发异步同步（可通过环境变量禁用）。同步使用 Prisma upsert 写入 `EmailMessage`，并更新 `email.json` 的 `sync`/`status`。

**Tech Stack:** node-imap, mailparser, sanitize-html, Prisma

> 备注：根据项目规则（Superpowers 规则），本计划跳过 TDD 测试流程。

### Task 1: 新增 IMAP 同步服务

**Files:**
- Create: `apps/server/src/modules/email/emailSyncService.ts`

**Step 1: 解析账号与密码**

```ts
const config = readEmailConfigFile(workspaceId);
const account = config.emailAccounts.find((item) => normalizeEmail(item.emailAddress) === target);
const password = getEmailEnvValue(account.auth.envKey);
```

**Step 2: 建立 IMAP 连接并抓取最近 50 封**

```ts
const imap = new Imap({ user: account.emailAddress, password, host: account.imap.host, port: account.imap.port, tls: account.imap.tls });
await openBox(mailboxPath, true);
const total = box.messages.total ?? 0;
const from = Math.max(total - limit + 1, 1);
const fetch = imap.seq.fetch(`${from}:${total}`, { bodies: "", struct: true });
```

**Step 3: mailparser 解析 + sanitize-html 清洗**

```ts
const parsed = await simpleParser(raw);
const bodyHtml = parsed.html ? sanitizeHtml(String(parsed.html), DEFAULT_SANITIZE_OPTIONS) : undefined;
```

**Step 4: Prisma upsert 写库 + 更新 sync/status**

```ts
await prisma.emailMessage.upsert({
  where: { workspaceId_accountEmail_mailboxPath_uid: { workspaceId, accountEmail, mailboxPath, uid } },
  create: { ... },
  update: { ... },
});
```

### Task 2: addAccount 触发同步 + 测试保护

**Files:**
- Modify: `apps/server/src/routers/email.ts`
- Modify: `apps/server/src/routers/__tests__/emailRouter.test.ts`

**Step 1: addAccount 内触发同步（默认开启）**

```ts
if (shouldAutoSyncOnAdd()) {
  void syncRecentMailboxMessages({ prisma: ctx.prisma, workspaceId: input.workspaceId, accountEmail: created.emailAddress, mailboxPath: "INBOX", limit: 50 });
}
```

**Step 2: 测试中关闭自动同步**

```ts
process.env.EMAIL_SYNC_ON_ADD = "0";
```

### Task 3: 安装依赖

**Files:**
- Modify: `apps/server/package.json`

**Step 1: 添加依赖**

```
imap
mailparser
sanitize-html
```

**Step 2: 添加类型（若缺失）**

```
@types/imap
```
