---
name: email-development
description: Use when developing, extending, or debugging the email module — covers account config, IMAP/SMTP sync, OAuth2 Graph/Gmail, transport adapters, idle/polling, email sending (SMTP/Gmail/Graph), file store, attachment caching, soft delete, message move/delete, draft auto-save, batch operations, search, compose/reply/forward UI, or related DB schema and tests
---

# Email Development

## Overview

邮箱模块覆盖完整收发链路：

- **收侧**：账号配置、多协议传输（IMAP/SMTP + Microsoft Graph API + Gmail API）、OAuth2 授权、邮件夹与消息同步、标记更新、IDLE/轮询监听
- **写侧**：邮件发送（SMTP / Gmail API / Graph API）、撰写/回复/全部回复/转发、附件下载与本地缓存、消息移动/软删除、草稿自动保存、批量操作、服务端搜索

### 存储架构（双层：文件系统 + DB 索引）

邮件内容存储在文件系统（`<workspaceRoot>/.openloaf/email-store/`），DB（SQLite）仅作轻量索引。同步时双写（DB + 文件），读取优先从文件。

```
.openloaf/email-store/
  <accountEmail>/                    # 小写 normalize
    mailboxes.json                   # 邮箱文件夹元数据
    drafts/<draftId>.json            # 草稿文件
    <encodedMailboxPath>/            # base64url 编码
      index.jsonl                    # 邮件索引（轻量，快速列表）
      <externalId>/                  # 每封邮件一个目录
        meta.json                    # 完整元数据
        body.html                    # 已清洗 HTML（可直接浏览器打开）
        body.md                      # Markdown 正文
        message.eml                  # 原始 RFC822
        attachments/                 # 按需下载缓存
```

配置落地在 workspace 根目录的 `email.json`，密码与 OAuth 令牌落入 `apps/server/.env`（可用 `OPENLOAF_SERVER_ENV_PATH` 覆盖）；DB 模型 `EmailMessage`（瘦身索引表）/ `EmailMailbox` / `EmailDraft`。Web 端包含 Desktop 收件箱 widget 和完整的撰写编辑器。

### 认证方式

| 类型 | 提供商 | 配置 |
|------|--------|------|
| `password` | 所有 IMAP 邮箱 | imap/smtp + 密码存 .env |
| `oauth2-graph` | Microsoft 365 / Outlook | Graph API，需 `MICROSOFT_CLIENT_ID` |
| `oauth2-gmail` | Gmail / Google Workspace | Gmail API，需 `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` |

## When to Use

- 新增/修改邮箱账号配置、IMAP/SMTP 参数、密码存储逻辑
- 开发或调试 OAuth2 授权流程（Microsoft / Google）
- 新增或修改传输适配器（IMAP / Graph / Gmail）
- 调整邮件夹同步、邮件同步、解析/清洗邮件正文
- 修改邮件标记（已读/星标）、未读统计或统一收件箱逻辑
- 调整 IDLE 监听或 OAuth 轮询逻辑
- 修改邮件相关 DB schema 或 API schema
- 修改前端邮箱添加对话框、服务商预设、OAuth 弹窗流程
- 开发或调试邮件发送功能（SMTP / Gmail API / Graph API）
- 修改撰写/回复/全部回复/转发编辑器
- 开发附件下载端点或前端下载链接
- 修改消息移动/删除逻辑
- 开发草稿自动保存或草稿管理
- 修改批量操作（批量标记已读/删除/移动）
- 修改服务端搜索功能

## Quick Reference

### 文件映射

| 层 | 路径 | 职责 |
|----|------|------|
| **DB Schema** | `packages/db/prisma/schema/email.prisma` | `EmailMessage`（瘦身索引表，无正文字段）/ `EmailMailbox` / `EmailDraft`（无 body 字段） |
| **API Schema** | `packages/api/src/routers/email.ts` | tRPC schema（`addAccount` 为 discriminatedUnion；含 `sendMessage`、`deleteMessage`、`moveMessage`、`saveDraft`、`listDrafts`、`batchMarkRead`、`batchDelete`、`batchMove`、`searchMessages`、`restoreMessage` 等） |
| **File Store** | `apps/server/src/modules/email/emailFileStore.ts` | 核心文件存储层：邮件目录 CRUD、JSONL 索引、LRU 缓存（30 邮箱 + mtime）、附件缓存、per-mailbox mutex、草稿文件操作 |
| **Transport Types** | `apps/server/src/modules/email/transport/types.ts` | `EmailTransportAdapter` 接口、`TransportMessage`、`TransportMailbox`、`SendMessageInput`、`DownloadAttachmentResult` |
| **IMAP Adapter** | `apps/server/src/modules/email/transport/imapAdapter.ts` | IMAP 协议传输实现（含 downloadAttachment / deleteMessage / moveMessage / testConnection） |
| **Graph Adapter** | `apps/server/src/modules/email/transport/graphAdapter.ts` | Microsoft Graph API 传输实现（含 sendMessage / downloadAttachment / deleteMessage / moveMessage） |
| **Gmail Adapter** | `apps/server/src/modules/email/transport/gmailAdapter.ts` | Gmail API 传输实现（含 sendMessage / downloadAttachment / deleteMessage / moveMessage） |
| **SMTP Sender** | `apps/server/src/modules/email/transport/smtpSender.ts` | nodemailer SMTP 发送 + 连接测试 |
| **Transport Factory** | `apps/server/src/modules/email/transport/factory.ts` | `createTransport(account, options?)` 工厂 |
| **Send Service** | `apps/server/src/modules/email/emailSendService.ts` | 统一发送路由：password→SMTP，oauth2-gmail→Gmail API，oauth2-graph→Graph API |
| **Attachment Routes** | `apps/server/src/modules/email/emailAttachmentRoutes.ts` | Hono `GET /api/email/attachment` 二进制下载端点（本地缓存优先，未命中再远程下载并缓存） |
| **OAuth Types** | `apps/server/src/modules/email/oauth/types.ts` | `OAuthProviderConfig`、`OAuthTokenSet`、`OAuthState` |
| **OAuth Providers** | `apps/server/src/modules/email/oauth/providers.ts` | Microsoft / Google 提供商配置 |
| **OAuth Flow** | `apps/server/src/modules/email/oauth/oauthFlow.ts` | PKCE 生成、授权 URL、code 交换、用户邮箱获取 |
| **Token Manager** | `apps/server/src/modules/email/oauth/tokenManager.ts` | 令牌存储/读取/刷新（.env 持久化） |
| **OAuth Routes** | `apps/server/src/modules/email/oauth/emailOAuthRoutes.ts` | Hono 路由：`/auth/email/:providerId/start` + `/callback` |
| **Config Store** | `apps/server/src/modules/email/emailConfigStore.ts` | `email.json` 读写，auth 为 discriminatedUnion |
| **Account Service** | `apps/server/src/modules/email/emailAccountService.ts` | `addEmailAccount` / `addOAuthEmailAccount` / `removeEmailAccount` |
| **Sync Service** | `apps/server/src/modules/email/emailSyncService.ts` | IMAP 邮件同步（使用 `externalId`）、标记更新、双写文件系统、地址格式归一化（`extractAddressValues`） |
| **Mailbox Service** | `apps/server/src/modules/email/emailMailboxService.ts` | IMAP 邮件夹同步、双写 mailboxes.json |
| **Idle Manager** | `apps/server/src/modules/email/emailIdleManager.ts` | IMAP IDLE + OAuth 轮询（60s 间隔） |
| **Env Store** | `apps/server/src/modules/email/emailEnvStore.ts` | `.env` 读写（密码 + OAuth 令牌） |
| **Flags** | `apps/server/src/modules/email/emailFlags.ts` | 邮件标记工具函数（含 `hasDeletedFlag`/`ensureDeletedFlag`/`removeDeletedFlag` 软删除支持） |
| **Content Filter** | `apps/server/src/modules/email/emailSanitize.ts` | 共享 sanitize 模块（SANITIZE_OPTIONS + sanitizeEmailHtml） |
| **Server Router** | `apps/server/src/routers/email.ts` | tRPC 实现（`EmailRouterImpl`）— 含 sendMessage / deleteMessage（软删除）/ moveMessage / saveDraft / listDrafts / getDraft / deleteDraft / batchMarkRead / batchDelete（软删除）/ batchMove / searchMessages / restoreMessage；读取正文从文件系统 |
| **Route Registration** | `apps/server/src/bootstrap/createApp.ts` | `registerEmailOAuthRoutes(app)` + `registerEmailAttachmentRoutes(app)` |
| **Provider Presets** | `apps/web/src/components/email/email-provider-presets.ts` | 服务商预设（含 `authType` / `oauthProvider`） |
| **Types (Web)** | `apps/web/src/components/email/email-types.ts` | 前端表单状态（含 `authType` / `oauthAuthorized` / `ComposeMode` / `ComposeDraft` / `UnifiedMailboxScope` 含 `"deleted"`） |
| **Add Dialog** | `apps/web/src/components/email/EmailAddAccountDialog.tsx` | 添加账号对话框（OAuth 弹窗 + 密码表单） |
| **Page State** | `apps/web/src/components/email/use-email-page-state.ts` | 邮箱页面状态管理（含 OAuth 流程、compose/reply/send/delete/draft 状态和 mutations；刷新同时同步邮箱文件夹列表+消息） |
| **Style Tokens** | `apps/web/src/components/email/email-style-system.ts` | 邮箱页面样式系统 token（胶囊玻璃材质、强调色、状态色） |
| **Message List** | `apps/web/src/components/email/EmailMessageList.tsx` | 邮件列表区（搜索、分页滚动、选中态、移动端进入详情） |
| **Compose Editor** | `apps/web/src/components/email/EmailForwardEditor.tsx` | 撰写/回复/全部回复/转发编辑器（多模式） |
| **Message Detail** | `apps/web/src/components/email/EmailMessageDetail.tsx` | 邮件详情（含回复/全部回复/删除按钮、附件下载链接） |
| **Email Page** | `apps/web/src/components/email/EmailPage.tsx` | 邮箱主页面（含三栏卡片布局、移动端列表优先切换、撰写编辑器显示逻辑） |
| **Sidebar** | `apps/web/src/components/email/EmailSidebar.tsx` | 邮箱侧边栏（含"写邮件"按钮、统一视图入口含"已删除"虚拟文件夹、账户树） |
| **File Store Tests** | `apps/server/src/modules/email/__tests__/emailFileStore.test.ts` | 文件存储层测试（31 用例：纯函数/I/O/集成） |
| **Flags Tests** | `apps/server/src/modules/email/__tests__/emailFlags.test.ts` | 标记函数测试（含软删除） |

### Core Flow

#### 密码账号添加
```
UI 选择服务商 → 填写 IMAP/SMTP + 密码 → addAccount(authType:"password") → emailAccountService.addEmailAccount → 写 email.json + .env → 触发 IMAP 同步
```

#### OAuth 账号添加
```
UI 选择 Exchange/Gmail → 点击"授权登录" → window.open(/auth/email/:provider/start) �� PKCE → 重定向到提供商 → 用户授权 → /callback → exchangeCode → fetchUserEmail → storeOAuthTokens → 成功页面 auto-close → UI 检测 oauthEmail → addAccount(authType:"oauth2-graph"|"oauth2-gmail") → emailAccountService.addOAuthEmailAccount → 写 email.json → 触发 API 同步
```

#### 实时通知
```
IMAP 账号: EmailIdleManager → IMAP IDLE 连接 → 收到 mail 事件 → triggerSync
OAuth 账号: EmailIdleManager → 60s 轮询定时器 → triggerSync
```

#### 邮件发送
```
UI 点击发送 → sendMessage mutation → emailSendService.sendEmail(workspaceId, accountEmail, input)
  → 读取 emailConfigStore 获取账号配置
  → 根据 auth.type 路由:
    password → smtpSender.sendViaSMTP(smtpConfig, input)
    oauth2-gmail → gmailAdapter.sendMessage(input)  (构造 RFC 822 → base64url → POST users.messages.send)
    oauth2-graph → graphAdapter.sendMessage(input)   (POST /me/sendMail JSON payload)
```

#### 撰写/回复/转发
```
写邮件: onStartCompose → 创建空 ComposeDraft(mode:"compose") → 显示编辑器
回复:   onStartReply → 从当前消息提取 to/subject/inReplyTo → ComposeDraft(mode:"reply")
全部回复: onStartReplyAll → 提取 to+cc/subject/inReplyTo → ComposeDraft(mode:"replyAll")
转发:   已有 forwardDraft 机制 → ComposeDraft(mode:"forward")
```

#### 附件下载（缓存优先）
```
前端 <a href="/api/email/attachment?workspaceId=...&messageId=...&index=..."> → Hono 端点
  → 先检查本地缓存 readCachedAttachment(attachments/<filename>)
  → 命中 → 直接返回文件
  → 未命中 → createTransport → adapter.downloadAttachment → 返回 Buffer + cacheAttachment 缓存到本地
```

#### 草稿自动保存
```
编辑器内容变更 → 3s debounce → saveDraft mutation → DB upsert EmailDraft（无 body 字段）+ saveDraftFile 写文件
取消/发送成功 → deleteDraft mutation → 清除 DB 记录 + deleteDraftFile 清除文件
```

#### 批量操作
```
batchMarkRead: 遍历 messageIds → adapter.markAsRead + DB 更新 + 文件 flags 更新
batchDelete:   遍历 messageIds → 软删除（添加 \\Deleted 标记到 DB + 文件），不再硬删除
batchMove:     遍历 messageIds → adapter.moveMessage + DB 更新 mailboxPath + moveEmailMessageFile
```

#### 软删除
```
deleteMessage / batchDelete → 添加 \\Deleted 标记（DB flags + meta.json + index.jsonl）
"已删除"虚拟文件夹 → 跨邮箱过滤 \\Deleted 标记的邮件
restoreMessage → 移除 \\Deleted 标记
正常邮箱视图 → 自动排除 \\Deleted 邮件（listUnifiedMessages 过滤）
```

### DB Schema 关键字段（瘦身索引表）

| 字段 | 类型 | 说明 |
|------|------|------|
| `externalId` (String) | IMAP UID 字符串化 或 API message ID |
| `mailboxPath` (String) | IMAP mailbox 路径 或 API folder ID |
| `from` / `to` (Json) | 地址数组 `[{address, name}]`（已归一化，无冗余 html/text） |
| `flags` (Json) | 标记数组，含 `\\Seen`/`\\Flagged`/`\\Deleted` 等 |
| 唯一约束 | `@@unique([workspaceId, accountEmail, mailboxPath, externalId])` |
| 已移除字段 | `bodyHtml`/`bodyHtmlRaw`/`bodyText`/`rawRfc822` → 迁移到文件系统 |
- `EmailDraft`: 草稿模型，字段含 mode（compose/reply/replyAll/forward）、to/cc/bcc（JSON 数组）、subject、inReplyTo、references、accountEmail。`body` 字段已移除，正文存储在 `drafts/<id>.json` 文件中
- `EmailDraft` 唯一约束: `@@unique([workspaceId, accountEmail, inReplyTo])`（同一封邮件只保留一份草稿）

### Auth Schema (email.json)

```typescript
// discriminatedUnion on "type"
| { type: "password"; envKey: string }
| { type: "oauth2-graph"; refreshTokenEnvKey: string; accessTokenEnvKey: string; expiresAtEnvKey: string }
| { type: "oauth2-gmail"; refreshTokenEnvKey: string; accessTokenEnvKey: string; expiresAtEnvKey: string }
```

### Env Key 命名规则

| 类型 | 格式 | 示例 |
|------|------|------|
| 密码 | `EMAIL_PASS__{workspaceId}__{slug}` | `EMAIL_PASS__ws1__user_example_com` |
| OAuth Refresh | `EMAIL_OAUTH_REFRESH__{workspaceId}__{slug}` | `EMAIL_OAUTH_REFRESH__ws1__user_outlook_com` |
| OAuth Access | `EMAIL_OAUTH_ACCESS__{workspaceId}__{slug}` | `EMAIL_OAUTH_ACCESS__ws1__user_outlook_com` |
| OAuth Expires | `EMAIL_OAUTH_EXPIRES__{workspaceId}__{slug}` | `EMAIL_OAUTH_EXPIRES__ws1__user_outlook_com` |

### Transport Adapter 接口

```typescript
interface EmailTransportAdapter {
  type: "imap" | "graph" | "gmail";
  // 收侧
  listMailboxes(): Promise<TransportMailbox[]>;
  fetchRecentMessages(mailboxPath: string, limit: number, sinceExternalId?: string): Promise<TransportMessage[]>;
  markAsRead(mailboxPath: string, externalId: string): Promise<void>;
  setFlagged(mailboxPath: string, externalId: string, flagged: boolean): Promise<void>;
  dispose(): Promise<void>;
  // 写侧（可选）
  sendMessage?(input: SendMessageInput): Promise<SendMessageResult>;
  downloadAttachment?(mailboxPath: string, externalId: string, attachmentIndex: number): Promise<DownloadAttachmentResult>;
  moveMessage?(fromMailbox: string, toMailbox: string, externalId: string): Promise<void>;
  deleteMessage?(mailboxPath: string, externalId: string): Promise<void>;
  testConnection?(): Promise<{ success: boolean; error?: string }>;
}
```

### OAuth 环境变量

| 提供商 | 变量 | 说明 |
|--------|------|------|
| Microsoft | `MICROSOFT_CLIENT_ID` | Azure App Registration Client ID（public client，无 secret） |
| Google | `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| Google | `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |

### OAuth 回调路由

- `GET /auth/email/microsoft/start?workspaceId=xxx` → 重定向到 Microsoft 授权页
- `GET /auth/email/microsoft/callback?code=xxx&state=xxx` → 交换令牌 → 成功页面
- `GET /auth/email/google/start?workspaceId=xxx` → 重定向到 Google 授权页
- `GET /auth/email/google/callback?code=xxx&state=xxx` → 交换令牌 → 成功页面

## Common Mistakes

- 修改 `email.json` 结构但未同步更新 `EmailConfig` schema（注意 auth 是 discriminatedUnion）
- 调整账号认证逻辑却遗漏 `.env` 读写路径与 env key 规则
- 修改路由或 schema 但未同步更新 `packages/api` 与服务端实现
- 同步逻辑改动后未更新邮件夹/邮件统计相关测试
- 访问 `account.imap` 或 `account.smtp` 时未考虑 OAuth 账号可能为 `undefined`（需用 `!` 或先检查 auth type）
- OAuth 令牌刷新失败时未正确回退（tokenManager 有 5 分钟缓冲）
- 新增 OAuth 提供商时忘记在 `providers.ts`、`email-provider-presets.ts`、`emailConfigStore.ts` auth schema 三处同步添加
- DB 查询使用 `uid` 而非 `externalId`（已从 Int 迁移为 String）
- Gmail API 发送时 body 必须构造完整 RFC 822 MIME 消息并 base64url 编码（不是普通 base64）
- 附件下载走 Hono HTTP 端点（`/api/email/attachment`）而非 tRPC — tRPC 不适合传输二进制大文件
- `emailSendService` 路由逻辑：password→SMTP，oauth2-gmail→Gmail API，oauth2-graph→Graph API，新增认证类型时需同步更新
- 前端 `ComposeDraft` 的 `mode` 字段决定编辑器行为（compose/reply/replyAll/forward），切换模式时需正确设置 inReplyTo/references
- 草稿自动保存使用 3s debounce，发送成功或取消时需调用 `deleteDraft` 清理 DB 记录 + 文件
- 批量操作需逐条调用 adapter 方法（无批量 API），大量操作时注意性能
- `searchMessages` 当前为本地 DB 搜索（subject/snippet contains），非服务端 IMAP/API 搜索
- 切换 `workspaceId` 时若不先清空邮件页本地状态（`activeMessageId`/activeView 等），可能会带着旧工作空间 messageId 触发 `getMessage`，导致"邮件不存在"误报；无账号工作空间需对消息/详情查询使用 `skipToken`
- **DB 已移除正文字段**：`bodyHtml`/`bodyHtmlRaw`/`bodyText`/`rawRfc822` 已从 `EmailMessage` 移除，`body` 已从 `EmailDraft` 移除。读取正文必须从文件系统（`readEmailBodyHtml`/`readEmailBodyMd`/`readDraftFile`）
- **地址格式**：`from`/`to`/`cc`/`bcc` 存储为 `[{address, name}]` 纯数组。IMAP adapter 返回的 mailparser `AddressObject`（含冗余 `html`/`text`）在 sync service 中通过 `extractAddressValues` 归一化
- **双写一致性**：DB 写入和文件写入必须同步。文件写入使用 fire-and-forget（`void ... .catch()`），失败不阻塞主流程
- **`listUnifiedMessages` 依赖 `EmailMailbox` 表**：统一视图通过 `isInboxMailbox` 过滤邮箱，若 `EmailMailbox` 表为空则返回空列表。清空 DB 后必须先同步邮箱文件夹列表（`syncMailboxes`）
- **软删除**：`deleteMessage`/`batchDelete` 不再硬删除，而是添加 `\\Deleted` 标记。恢复用 `restoreMessage`。正常视图自动排除 `\\Deleted` 邮件

## Skill Sync Policy

**硬性规则：只要修改邮箱相关内容，必须立即同步更新本 skill（本文件）。**

建议检查范围（任一变更都需要更新本 skill 的描述/流程/文件映射）：

- `apps/server/src/modules/email/**`
- `apps/server/src/modules/email/transport/**`
- `apps/server/src/modules/email/oauth/**`
- `apps/server/src/routers/email.ts`
- `packages/api/src/routers/email.ts`
- `packages/db/prisma/schema/email.prisma`
- `apps/web/src/components/email/**`
- `apps/server/src/modules/email/__tests__/**`
- `apps/server/src/routers/__tests__/emailRouter.test.ts`
- `apps/server/src/bootstrap/createApp.ts`（OAuth 路由 + 附件下载路由注册）
- `apps/server/package.json`（nodemailer 依赖）

同步要求：提交代码前，确保本 skill 的 Overview / Quick Reference / Core Flow 与实际实现一致。
