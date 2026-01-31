# Email Page API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 EmailPage 从 mock 数据切换到业务接口，并实现 `listMessages`/`getMessage` 的数据库读取与详情渲染（正文优先 `bodyHtml`）。

**Architecture:** 后端以数据库为唯一数据源；`emailRouter` 直接查询 `EmailMessage` 并做 DTO 映射。前端通过 tRPC 拉取列表与详情，详情优先渲染 `bodyHtml`，为空时回退 `bodyText`。

**Tech Stack:** Next.js 16, tRPC, Prisma (libsql), React Query

> 备注：根据项目规则（Superpowers 规则），本计划跳过 TDD 测试流程。

### Task 1: 邮件路由接入数据库

**Files:**
- Modify: `packages/api/src/routers/email.ts`

**Step 1: 定义详情输入/输出与地址解析工具**

```ts
const getMessageInputSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
});

const emailMessageDetailSchema = z.object({
  id: z.string(),
  accountEmail: z.string(),
  mailbox: z.string(),
  subject: z.string().optional(),
  from: z.array(z.string()),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  date: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  attachments: z.array(
    z.object({
      filename: z.string().optional(),
      contentType: z.string().optional(),
      size: z.number().int().optional(),
    }),
  ),
  flags: z.array(z.string()),
});
```

**Step 2: listMessages 走 prisma 查询并映射**

```ts
const rows = await ctx.prisma.emailMessage.findMany({
  where: {
    workspaceId: input.workspaceId,
    accountEmail: input.accountEmail,
    mailboxPath: input.mailbox,
  },
  orderBy: { date: "desc" },
  take: 200,
});
```

**Step 3: getMessage 走 prisma 查询并映射**

```ts
const row = await ctx.prisma.emailMessage.findFirst({
  where: { id: input.id, workspaceId: input.workspaceId },
});
if (!row) throw new Error("邮件不存在。");
```

### Task 2: 更新 emailRouter 测试（非 TDD）

**Files:**
- Modify: `packages/api/src/routers/__tests__/emailRouter.test.ts`

**Step 1: 设置 DATABASE_URL 为临时文件**

```ts
process.env.DATABASE_URL = `file:${path.join(tempRoot, "email.db")}`;
```

**Step 2: 创建 EmailMessage 表与索引（sqlite）**

```ts
await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "EmailMessage" (
    "id" TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "mailboxPath" TEXT NOT NULL,
    "uid" INTEGER NOT NULL,
    "messageId" TEXT,
    "subject" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "bcc" TEXT,
    "date" DATETIME,
    "flags" TEXT,
    "snippet" TEXT,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "attachments" TEXT,
    "rawRfc822" TEXT,
    "size" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  );
`);
```

**Step 3: 插入一条测试邮件并断言 listMessages/getMessage**

```ts
await prisma.emailMessage.create({
  data: {
    id: "msg-1",
    workspaceId,
    accountEmail: "user@example.com",
    mailboxPath: "INBOX",
    uid: 1,
    subject: "Hello",
    from: { value: [{ address: "alice@example.com", name: "Alice" }], text: "Alice <alice@example.com>" },
    to: { value: [{ address: "user@example.com", name: "User" }], text: "User <user@example.com>" },
    date: new Date("2026-01-30T00:00:00Z"),
    flags: ["\\\\Seen"],
    snippet: "Hi there",
    bodyHtml: "<p>Hi</p>",
  },
});
```

### Task 3: EmailPage 接入 getMessage

**Files:**
- Modify: `apps/web/src/components/email/EmailPage.tsx`

**Step 1: 新增详情查询并绑定选中邮件**

```ts
const messageDetailQuery = useQuery(
  trpc.email.getMessage.queryOptions(
    workspaceId && activeMessageId
      ? { workspaceId, id: activeMessageId }
      : skipToken,
  ),
);
```

**Step 2: 正文渲染优先 bodyHtml**

```tsx
{detail?.bodyHtml ? (
  <div dangerouslySetInnerHTML={{ __html: detail.bodyHtml }} />
) : (
  <p>{detail?.bodyText || "暂无正文"}</p>
)}
```

**Step 3: 附件列表显示文件名/大小**

```tsx
{detail?.attachments?.length ? detail.attachments.map(...) : "暂无附件"}
```

