---
name: database-migration
description: >
  This skill should be used when modifying database schema (Prisma models),
  creating or editing migration files, debugging migration failures,
  understanding the migration runner architecture, or working on
  database backup/restore logic in incremental updates.
  Also use when adding new tables/columns, changing indexes,
  or troubleshooting seed.db generation.
---

# Database Migration System

> **术语映射**：代码 `workspace` = 产品「工作空间」，代码 `project` = 产品「工作区」。数据库表 `Project` 对应产品中的「工作区」。

OpenLoaf 使用 **Prisma Migrate + 自定义 migrationRunner** 实现数据库 schema 版本管理。迁移 SQL 在构建时内嵌到 `server.mjs`，运行时由 migrationRunner 自动执行，支持跨版本增量更新和崩溃回退。

## When to Use

- 修改 Prisma schema（新增/修改表、字段、索引）
- 创建或调试迁移文件
- 修改 `migrationRunner.ts` 或 `migrations.generated.ts` 生成逻辑
- 修改 `build-prod.mjs` 中的 seed.db 生成流程
- 修改增量更新中的数据库备份/恢复逻辑
- 排查 server 启动时迁移失败的问题

**不适用：** 普通的数据库 CRUD 操作、tRPC 路由开发

---

## Architecture Overview

```
开发时                          构建时                        运行时
────────                      ──────                      ──────
prisma migrate dev            generate-migrations-index    migrationRunner
  ↓                             ↓                            ↓
prisma/migrations/            migrations.generated.ts      检查 _prisma_migrations 表
  20260307000000_baseline/      (SQL 内嵌为字符串)             ↓
  20260310_add_feature/           ↓                        执行未应用的迁移
  ...                         esbuild bundle                 ↓
                                ↓                          记录到 _prisma_migrations
                              server.mjs (含所有迁移SQL)
                                ↓
                              prisma migrate deploy
                                ↓
                              seed.db (含 _prisma_migrations 记录)
```

## Key Files

| 文件 | 用途 |
|------|------|
| `packages/db/prisma/schema/*.prisma` | Prisma 数据模型定义 |
| `packages/db/prisma/migrations/` | 迁移 SQL 文件（Git 追踪） |
| `packages/db/src/migrationRunner.ts` | 运行时迁移执行器 |
| `packages/db/src/migrations.generated.ts` | 构建时生成的迁移索引（.gitignore） |
| `packages/db/scripts/generate-migrations-index.mjs` | 扫描迁移目录生成 TS 索引 |
| `apps/server/scripts/build-prod.mjs` | 生产构建（生成迁移索引 → esbuild → seed.db） |
| `apps/server/src/index.ts` | server 启动入口（执行迁移 → initDatabase） |
| `apps/desktop/src/main/incrementalUpdate.ts` | 增量更新中的 DB 备份/恢复逻辑 |

## 迁移文件结构

```
packages/db/prisma/migrations/
  20260307000000_baseline/          ← 基线：当前完整 schema 的 CREATE TABLE
    migration.sql
  20260310090000_add_chat_pinned/   ← 增量变更
    migration.sql
  20260315120000_add_project_tags/  ← 增量变更
    migration.sql
```

- 目录名格式：`YYYYMMDDHHMMSS_description`
- 每个目录包含一个 `migration.sql`
- **baseline 迁移**（`20260307000000_baseline`）是当前完整 schema 的快照
- 迁移文件**必须提交到 Git**

---

## Development Workflow

### 新增 Schema 变更

```bash
# 1. 修改 Prisma schema 文件
#    packages/db/prisma/schema/chat.prisma（或其他 .prisma 文件）

# 2. 生成迁移文件（开发环境）
pnpm run db:migrate
# 等同于: prisma migrate dev --name <description>
# 会提示输入迁移名称，自动生成 SQL 文件

# 3. 重新生成 Prisma Client
pnpm run db:generate

# 4. 验证类型正确
pnpm run check-types
```

### 迁移 SQL 编写规范

- Prisma 自动生成的 SQL 一般不需要手动修改
- 如需手动编写（如数据回填），注意：
  - 使用 SQLite 兼容语法
  - 不要使用事务包裹（migrationRunner 逐语句执行）
  - `ALTER TABLE ... ADD COLUMN` 必须提供 `DEFAULT` 值（SQLite 限制）
  - 避免 `DROP COLUMN`（SQLite 3.35.0 之前不支持）

### 常用 Prisma 命令

| 命令 | 用途 | 使用场景 |
|------|------|---------|
| `pnpm run db:migrate` | 创建新迁移 | 开发时修改 schema 后 |
| `pnpm run db:generate` | 生成 Prisma Client | schema 变更后 |
| `pnpm run db:push` | 直接推送 schema（无迁移） | **仅用于原型开发，禁止用于生产** |
| `pnpm run db:migrate-deploy` | 应用所有待执行迁移 | 构建时生成 seed.db |
| `pnpm run db:generate-migrations-index` | 生成迁移索引 TS 文件 | 构建时自动调用 |
| `pnpm run db:studio` | Prisma Studio | 调试数据 |

---

## Build Pipeline

`apps/server/scripts/build-prod.mjs` 的构建流程：

```
Step 1: pnpm --filter @openloaf/db db:generate-migrations-index
        → 扫描 prisma/migrations/ 生成 migrations.generated.ts
        → 每个迁移包含 { name, sql, checksum(sha256) }

Step 2: esbuild bundle
        → migrations.generated.ts 被内联到 server.mjs
        → server.mjs 包含所有历史迁移 SQL

Step 3: prisma migrate deploy (OPENLOAF_DATABASE_URL=file:dist/seed.db)
        → 创建 seed.db 并应用所有迁移
        → seed.db 中的 _prisma_migrations 表记录了所有已应用的迁移

Step 4: 清理业务数据（保留 _prisma_migrations 表！）
        → DELETE FROM 所有业务表
        → VACUUM

产出: dist/server.mjs + dist/seed.db
```

**关键**：清理 seed.db 时**不能删除 `_prisma_migrations` 表的数据**，否则新用户首次启动时 migrationRunner 会重复执行所有迁移导致 `table already exists` 错误。

---

## Runtime Migration (migrationRunner)

### 执行时机

server 启动时，在 `initDatabase()` 之前调用：

```typescript
const { applied } = await runPendingMigrations(prisma, embeddedMigrations)
await initDatabase()  // WAL mode + busy_timeout
```

### 三种用户场景

| 场景 | _prisma_migrations 表 | 业务表 | 行为 |
|------|----------------------|--------|------|
| 新用户（seed.db 复制） | 存在，记录齐全 | 空 | 跳过所有迁移 |
| 老用户（db:push 时代） | 不存在 | 存在 | 创建表，标记 baseline 已应用，执行后续迁移 |
| 正常更新用户 | 存在，部分记录 | 存在 | 执行未应用的迁移 |

### Baseline 机制

第一个迁移 `20260307000000_baseline` 是当前完整 schema 的 `CREATE TABLE` 语句。

- **新用户**：seed.db 中已标记 baseline 为已应用 → 跳过
- **老用户**：migrationRunner 检测到「无 _prisma_migrations 表 + 有业务表」→ 创建迁移表，标记 baseline 为已应用（不执行 SQL），然后从下一个迁移开始执行
- **空库**：从 baseline 开始全部执行

### 跨版本更新

迁移按目录名（时间戳）排序，逐个执行。用户从 v0.2.0 跳到 v0.5.0：

```
_prisma_migrations 中已有：001, 002, 003
server.mjs 内嵌：001, 002, 003, 004, 005, 006, 007
→ 执行 004, 005, 006, 007
```

无需关心用户跳过了多少个版本，所有未应用的迁移按序执行。

---

## Database Backup & Rollback

### 备份时机

增量更新下载新 server 前（`incrementalUpdate.ts`）：

```
检测到 server 有更新
  → backupDatabase()
    → 复制 openloaf.db → openloaf.db.pre-update.bak
    → 复制 openloaf.db-wal → openloaf.db.pre-update.bak-wal（如存在）
    → 复制 openloaf.db-shm → openloaf.db.pre-update.bak-shm（如存在）
  → 下载并应用新 server
```

### 恢复时机

server 崩溃触发 `recordServerCrash()` 时：

```
server 异常退出 (exit code ≠ 0)
  → recordServerCrash()
    → 删除增量更新的 server/current
    → restoreDatabase()  ← 恢复更新前的 DB 备份
    → 崩溃版本加入黑名单
    → 回退到打包版本的 server
```

### 文件位置

```
~/.openloaf/
  openloaf.db                      ← 生产数据库
  openloaf.db.pre-update.bak       ← 更新前备份
  openloaf.db.pre-update.bak-wal   ← WAL 备份
  openloaf.db.pre-update.bak-shm   ← SHM 备份
```

---

## _prisma_migrations Table Schema

```sql
CREATE TABLE "_prisma_migrations" (
  "id"                    TEXT PRIMARY KEY NOT NULL,
  "checksum"              TEXT NOT NULL,        -- SHA-256 of migration SQL
  "finished_at"           DATETIME,
  "migration_name"        TEXT NOT NULL,        -- e.g. "20260307000000_baseline"
  "logs"                  TEXT,
  "rolled_back_at"        DATETIME,
  "started_at"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
);
```

与 Prisma 官方 `prisma migrate deploy` 完全兼容。

---

## Common Mistakes

| 错误 | 后果 | 正确做法 |
|------|------|---------|
| 用 `db:push` 代替 `db:migrate` | 不生成迁移文件，生产环境无法增量更新 schema | 始终用 `pnpm run db:migrate` 创建迁移 |
| 清理 seed.db 时删除 `_prisma_migrations` | 新用户 migrationRunner 重复执行，报 `table already exists` | 清理时 `filter(name !== '_prisma_migrations')` |
| 手动修改 `migrations.generated.ts` | 下次构建会被覆盖 | 只修改 `prisma/migrations/` 下的 SQL 文件 |
| 迁移 SQL 中用事务 | migrationRunner 逐语句执行，嵌套事务可能报错 | 不要在迁移 SQL 中写 `BEGIN/COMMIT` |
| `ALTER TABLE ADD COLUMN` 不加 `DEFAULT` | SQLite 要求新增列必须有默认值（除非允许 NULL） | 始终提供 `DEFAULT` 或 `NULL` |
| 忘记提交迁移文件到 Git | 其他开发者和 CI 无法获取迁移 | `prisma/migrations/` 必须在版本控制中 |
| server 启动顺序错误 | 迁移前 initDatabase 设置 WAL，迁移期间并发问题 | `runPendingMigrations()` 必须在 `initDatabase()` 之前 |

---

## Troubleshooting

### 迁移失败：table already exists

**原因**：seed.db 中 `_prisma_migrations` 被清空，或老用户 baseline 未正确标记。

**修复**：手动插入 baseline 记录：
```sql
INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
VALUES ('manual-baseline', '<checksum>', datetime('now'), '20260307000000_baseline', datetime('now'), 1);
```

### 迁移失败：column already exists

**原因**：迁移 SQL 尝试添加已存在的列（可能是老用户手动修改过 schema）。

**修复**：在迁移 SQL 中使用防御性写法（如果 Prisma 未自动生成）。

### server 启动崩溃循环

**原因**：迁移成功但 server 代码有 bug，每次启动都触发 `recordServerCrash()` 回退 DB 并重试。

**修复**：崩溃版本已自动加入黑名单 `crashedServerVersions`，不会再次尝试更新到该版本。
