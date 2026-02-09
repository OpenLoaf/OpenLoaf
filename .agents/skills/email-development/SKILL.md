---
name: email-development
description: Use when developing, extending, or debugging the email module (account config, IMAP/SMTP sync, idle listeners, email router, email DB schema) or its tests
---

# Email Development

## Overview

邮箱模块覆盖账号配置、IMAP/SMTP 连接、邮件夹与消息同步、邮件标记更新，以及 Idle 监听触发增量同步。配置落地在 workspace 根目录的 `email.json`，密码落入 `apps/server/.env`（可用 `TENAS_SERVER_ENV_PATH` 覆盖）；数据持久化到 Prisma 模型 `EmailMessage` / `EmailMailbox`。Web 端包含 Desktop 收件箱 widget，用于展示统一收件箱列表。

## When to Use

- 新增/修改邮箱账号配置、IMAP/SMTP 参数、密码存储逻辑
- 调整邮件夹同步、邮件同步、解析/清洗邮件正文
- 修改邮件标记（已读/星标）、未读统计或统一收件箱逻辑
- 调整 Idle 监听或自动同步策略
- 修改邮箱 tRPC 路由、schema 或数据库模型
- 扩展/修复邮箱相关测试

## When NOT to Use

- 仅涉及非邮箱业务的通用 auth/user/email 字段展示或文案变更

## Quick Reference

| 位置 | 作用 |
| --- | --- |
| `apps/server/src/modules/email/emailAccountService.ts` | 账号增删 + 密码 env key |
| `apps/server/src/modules/email/emailConfigStore.ts` | `email.json` schema + 读写 |
| `apps/server/src/modules/email/emailEnvStore.ts` | `.env` 读写 + 路径覆盖 |
| `apps/server/src/modules/email/emailMailboxService.ts` | 邮件夹同步 → `EmailMailbox` |
| `apps/server/src/modules/email/emailSyncService.ts` | 邮件同步 → `EmailMessage` |
| `apps/server/src/modules/email/emailIdleManager.ts` | IMAP IDLE 监听 |
| `apps/server/src/routers/email.ts` | tRPC 邮箱路由实现 |
| `packages/api/src/routers/email.ts` | 邮箱 schemas / BaseEmailRouter |
| `packages/db/prisma/schema/email.prisma` | EmailMessage / EmailMailbox |
| `apps/web/src/components/desktop/widgets/EmailInboxWidget.tsx` | Desktop 收件箱 widget |

## Environment Variables

- `TENAS_SERVER_ENV_PATH`: 覆盖 `apps/server/.env` 默认路径
- `EMAIL_PASSWORD__<workspaceId>__<slug>`: 邮箱密码
- `EMAIL_SYNC_ON_ADD`: 新增账号后是否自动同步（默认启用）
- `EMAIL_IMAP_SKIP`: 跳过 IMAP 操作（测试/排错）
- `EMAIL_IDLE_ENABLED`: 是否开启 Idle 监听（默认启用）
- `EMAIL_IDLE_MAILBOX`: Idle 监听邮件夹（默认 INBOX）
- `EMAIL_IDLE_SYNC_LIMIT`: Idle 触发的增量同步条数（默认 50）

## Core Flow

1. **新增账号**：`addEmailAccount()` → 写 `email.json` + `.env` → 触发自动同步/邮件夹同步
2. **邮件夹同步**：`syncEmailMailboxes()` → 拉 IMAP mailbox → 写 `EmailMailbox`
3. **邮件同步**：`syncRecentMailboxMessages()` → 拉 IMAP 消息 → 解析/清洗 → 写 `EmailMessage`
4. **Idle 监听**：`EmailIdleManager` 监听 IMAP → 触发近期同步

## Common Mistakes

- 修改 `email.json` 结构但未同步更新 `EmailConfig` schema
- 调整账号认证逻辑却遗漏 `.env` 读写路径与 env key 规则
- 修改路由或 schema 但未同步更新 `packages/api` 与服务端实现
- 同步逻辑改动后未更新邮件夹/邮件统计相关测试

## Skill Sync Policy

**硬性规则：只要修改邮箱相关内容，必须立即同步更新本 skill（本文件）。**

建议检查范围（任一变更都需要更新本 skill 的描述/流程/文件映射）：

- `apps/server/src/modules/email/**`
- `apps/server/src/routers/email.ts`
- `packages/api/src/routers/email.ts`
- `packages/db/prisma/schema/email.prisma`
- `apps/server/src/modules/email/__tests__/**`
- `apps/server/src/routers/__tests__/emailRouter.test.ts`

同步要求：提交代码前，确保本 skill 的 Overview / Quick Reference / Core Flow 与实际实现一致。
