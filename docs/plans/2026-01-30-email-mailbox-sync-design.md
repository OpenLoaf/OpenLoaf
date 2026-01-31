# 邮箱文件夹同步设计

## 目标

- 从 IMAP 获取完整文件夹层级并持久化到数据库。
- 前端文件夹列表从数据库渲染，支持层级展示与数量统计。
- 同步按钮同时刷新文件夹列表与当前邮箱邮件。

## 数据模型

新增 `EmailMailbox`：

- `workspaceId` / `accountEmail`
- `path`（IMAP 完整路径）
- `name`（显示名称）
- `parentPath`（父级路径）
- `delimiter`（分隔符）
- `attributes`（IMAP 属性，如 `\\Inbox`、`\\NoSelect`）

唯一索引 `(workspaceId, accountEmail, path)`，并按 `(workspaceId, accountEmail, parentPath)` 建索引。

## 同步流程

1. 通过 IMAP `getBoxes()` 获取树结构。
2. 递归展平为 `EmailMailbox` 列表。
3. 逐条 upsert 写入数据库（避免误删）。
4. 在 `email.json` 记录 `lastMailboxSyncAt` / `lastMailboxSyncError`。

## 前端渲染

- 新增 `listMailboxes` 查询，返回数据库中的文件夹列表。
- 前端构建树形结构并按层级缩进渲染。
- `listMailboxStats` 提供每个路径的数量，父级显示子级汇总。
- 同步按钮：触发 `syncMailboxes` + `syncMailbox`，并刷新列表与数量。

## 兼容与测试

- `EMAIL_IMAP_SKIP=1` 跳过 IMAP 连接，避免测试触网。
- 新增 `listMailboxes` 测试，验证 DB 返回路径与属性。
