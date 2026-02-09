---
name: email-development
description: Use when developing, extending, or debugging the email module (account config, IMAP/SMTP sync, OAuth2 Graph/Gmail, transport adapters, idle/polling listeners, email router, email DB schema) or its tests
---

# Email Development

## Overview

邮箱模块覆盖账号配置、多协议传输（IMAP/SMTP + Microsoft Graph API + Gmail API）、OAuth2 授权流程、邮件夹与消息同步、邮件标记更新，以及 IDLE/轮询监听触发增量同步。

配置落地在 workspace 根目录的 `email.json`，密码与 OAuth 令牌落入 `apps/server/.env`（可用 `TENAS_SERVER_ENV_PATH` 覆盖）；数据持久化到 Prisma 模型 `EmailMessage` / `EmailMailbox`。Web 端包含 Desktop 收件箱 widget，用于展示统一收件箱列表。

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

## Quick Reference

### 文件映射

| 层 | 路径 | 职责 |
|----|------|------|
| **DB Schema** | `packages/db/prisma/schema/email.prisma` | `EmailMessage`（`externalId` 字段）/ `EmailMailbox` |
| **API Schema** | `packages/api/src/routers/email.ts` | tRPC schema（`addAccount` 为 discriminatedUnion：password / oauth2-graph / oauth2-gmail） |
| **Transport Types** | `apps/server/src/modules/email/transport/types.ts` | `EmailTransportAdapter` 接口、`TransportMessage`、`TransportMailbox` |
| **IMAP Adapter** | `apps/server/src/modules/email/transport/imapAdapter.ts` | IMAP 协议传输实现 |
| **Graph Adapter** | `apps/server/src/modules/email/transport/graphAdapter.ts` | Microsoft Graph API 传输实现 |
| **Gmail Adapter** | `apps/server/src/modules/email/transport/gmailAdapter.ts` | Gmail API 传输实现 |
| **Transport Factory** | `apps/server/src/modules/email/transport/factory.ts` | `createTransport(account, options?)` 工厂 |
| **OAuth Types** | `apps/server/src/modules/email/oauth/types.ts` | `OAuthProviderConfig`、`OAuthTokenSet`、`OAuthState` |
| **OAuth Providers** | `apps/server/src/modules/email/oauth/providers.ts` | Microsoft / Google 提供商配置 |
| **OAuth Flow** | `apps/server/src/modules/email/oauth/oauthFlow.ts` | PKCE 生成、授权 URL、code 交换、用户邮箱获取 |
| **Token Manager** | `apps/server/src/modules/email/oauth/tokenManager.ts` | 令牌存储/读取/刷新（.env 持久化） |
| **OAuth Routes** | `apps/server/src/modules/email/oauth/emailOAuthRoutes.ts` | Hono 路由：`/auth/email/:providerId/start` + `/callback` |
| **Config Store** | `apps/server/src/modules/email/emailConfigStore.ts` | `email.json` 读写，auth 为 discriminatedUnion |
| **Account Service** | `apps/server/src/modules/email/emailAccountService.ts` | `addEmailAccount` / `addOAuthEmailAccount` / `removeEmailAccount` |
| **Sync Service** | `apps/server/src/modules/email/emailSyncService.ts` | IMAP 邮件同步（使用 `externalId`）、标记更新 |
| **Mailbox Service** | `apps/server/src/modules/email/emailMailboxService.ts` | IMAP 邮件夹同步 |
| **Idle Manager** | `apps/server/src/modules/email/emailIdleManager.ts` | IMAP IDLE + OAuth 轮询（60s 间隔） |
| **Env Store** | `apps/server/src/modules/email/emailEnvStore.ts` | `.env` 读写（密码 + OAuth 令牌） |
| **Flags** | `apps/server/src/modules/email/emailFlags.ts` | 邮件标记工具函数 |
| **Server Router** | `apps/server/src/routers/email.ts` | tRPC 实现（`EmailRouterImpl`） |
| **Route Registration** | `apps/server/src/bootstrap/createApp.ts` | `registerEmailOAuthRoutes(app)` |
| **Provider Presets** | `apps/web/src/components/email/email-provider-presets.ts` | 服务商预设（含 `authType` / `oauthProvider`） |
| **Types (Web)** | `apps/web/src/components/email/email-types.ts` | 前端表单状态（含 `authType` / `oauthAuthorized`） |
| **Add Dialog** | `apps/web/src/components/email/EmailAddAccountDialog.tsx` | 添加账号对话框（OAuth 弹窗 + 密码表单） |
| **Page State** | `apps/web/src/components/email/use-email-page-state.ts` | 邮箱页面状态管理（含 OAuth 流程） |

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

### DB Schema 关键字段

- `EmailMessage.externalId` (String): IMAP UID 字符串化 或 API message ID
- `EmailMessage.mailboxPath` (String): IMAP mailbox 路径 或 API folder ID
- 唯一约束: `@@unique([workspaceId, accountEmail, mailboxPath, externalId])`

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
  listMailboxes(): Promise<TransportMailbox[]>;
  fetchRecentMessages(mailboxPath: string, limit: number, sinceExternalId?: string): Promise<TransportMessage[]>;
  markAsRead(mailboxPath: string, externalId: string): Promise<void>;
  setFlagged(mailboxPath: string, externalId: string, flagged: boolean): Promise<void>;
  dispose(): Promise<void>;
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
- `apps/server/src/bootstrap/createApp.ts`（OAuth 路由注册）

同步要求：提交代码前，确保本 skill 的 Overview / Quick Reference / Core Flow 与实际实现一致。
