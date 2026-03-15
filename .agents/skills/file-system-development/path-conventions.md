# 文件路径规范

> **术语映射**：当前新代码以 **Project** 为主；文档里出现 `workspace` 基本都表示 legacy 兼容层、历史文件名或旧 UI 命名。

OpenLoaf 当前的文件路径系统遵循三条规则：

- 前端**不传绝对根路径**
- 服务端通过 `projectId` / `uri` 解析真实路径
- legacy `workspace*` 命名只保留在兼容层，不再作为新接口输入

---

## 前端传参规则

### 允许传的参数

HTTP / tRPC 层统一传：

- `projectId?` — 可选，表达项目作用域
- `uri` / `rootUri` — 相对路径或 `file://` URI
- 需要时补 `boardId` / `sessionId`

### 禁止传的参数

- `rootPath`（本地绝对目录）
- 任意服务端拼接后的真实根路径
- `workspaceId`（仅在 legacy 兼容链路保留）

---

## 目录层级

### 1. 全局配置目录

- 函数：`getOpenLoafRootDir()` — 返回 `~/.openloaf/`
- 函数：`getGlobalRootPath()` — 同义别名
- 用途：存放 `settings.json`、`providers.json`、`auth.json` 等全局配置

### 2. 默认项目存储根

- 函数：`getProjectStorageRootPath()` — 返回项目文件的默认存储根目录
- 来源：`getDefaultWorkspaceRootDir()`（命名为历史遗留，语义为项目存储根）
- `workspace.json` 文件名仍保留，语义已变为 **top-level project registry**

### 3. 项目目录

- 函数：`getProjectRootPath(projectId)` — 返回指定项目的根目录绝对路径
- 函数：`getProjectRootUri(projectId)` — 返回 `file://` URI 形式
- 用途：项目内所有文件操作的根

### 4. 全局临时存储目录

- 函数：`getResolvedTempStorageDir()` — 位于 `apps/server/src/ai/services/image/imageStorage.ts`
- 读取 `basicConfig.appTempStorageDir`，为空时回退到 `~/.openloaf/temp/`
- 用途：临时画布、无 projectId 场景下的文件存储根

---

## Scope 解析

### 1. 默认 scope

`resolveScopedRootPath({})` 未传 `projectId` 时，回退到全局配置目录（`getOpenLoafRootDir()`）。

这与"默认项目存储根"不是同一个概念。

### 2. 项目 scope

传入 `projectId` 后，scope 根目录变为 `getProjectRootPath(projectId)`。

### 3. Board scope

Board 文件在当前 scope 根下追加 `boards/<boardId>/` 前缀。

Board 资源与聊天附件的存储规则以具体模块实现为准。

### 4. 临时 scope（无 projectId）

当 `projectId` 为空时，媒体保存路径解析使用 `getResolvedTempStorageDir()` 作为根目录。

**典型场景**：临时/全局画布生成图片或视频时，`saveDir` 为相对路径（如 `boards/board_xxx/asset`），服务端在临时目录下解析为 `~/.openloaf/temp/boards/board_xxx/asset/`。

---

## 支持的路径输入格式

`resolveScopedPath()` 当前支持：

| 格式 | 示例 | 说明 |
|------|------|------|
| `file://` URI | `file:///Users/a/demo.txt` | 直接解析为本地路径 |
| 绝对路径 | `/Users/a/demo.txt` | 直接归一化 |
| `@{...}` 包裹 | `@{docs/a.md}` | 会先去掉包裹层 |
| `@relative` | `@docs/a.md` | 相对当前 scope 根 |
| `[projectId]/...` | `[proj_123]/docs/a.md` | 跨项目引用 |
| 普通相对路径 | `docs/a.md` | 相对当前 scope 根 |

限制：

- `@/` 和 `@\\` 形式会被拒绝
- 含 `..` 的相对路径必须经过边界校验（`resolveRelativeSaveDirectory` 会拒绝包含 `..` 的段）

---

## 媒体保存路径解析

`resolveImageSaveDirectory` / `resolveVideoSaveDirectory` 是媒体（图片/视频）保存时的路径解析入口。

### 支持的 saveDir 格式

| saveDir 格式 | 示例 | 解析方式 | 是否需要 projectId |
|-------------|------|---------|-------------------|
| `file://` URI | `file:///Users/.openloaf/temp/boards/xxx/asset` | `resolveFilePathFromUri()` 直接转本地路径 | 不需要 |
| `@[projectId]/path` | `@[proj_123]/boards/xxx/asset` | 从内嵌的 projectId 解析 root + 拼接 | 内嵌在 saveDir 里 |
| 相对路径 | `boards/board_xxx/asset` | 按 projectId 有无选择根目录 | 可选 |

### 相对路径 fallback 规则

```
有 projectId → getProjectRootPath(projectId) 作为根
无 projectId → getResolvedTempStorageDir() 作为根（默认 ~/.openloaf/temp/）
```

### 安全校验

- 路径归一化后不允许包含 `..` 段
- 解析后的绝对路径必须在根目录内（`targetPath.startsWith(rootPath + sep)`）
- 如果输入是文件路径（有图片/视频扩展名），自动取 `dirname` 作为目录

---

## 各模块路径处理

### 文件预览 / 最近打开

- 使用 `rootUri` + `projectId` 表达作用域
- 新代码不再透传 `workspaceId`
- `recent-open` 仅保留对旧 `openloaf:recent-open:${workspaceId}` key 的一次性 fallback

### Chat 附件

- 项目聊天附件：`.openloaf/chat-history/<sessionId>/...`
- Board 内聊天附件：`.openloaf/boards/<boardId>/chat-history/<sessionId>/...`

### HLS / 媒体

- 新代码应优先传 `projectId`
- 当前 `apps/web/src/lib/image/uri.ts` 已改为通用兼容 options bag，仍兼容旧 board / media 调用链传入旧 preview scope 字段
- 不要在新模块复制这套 legacy 入参

### Board 媒体生成

- 前端统一传相对路径（如 `boards/board_xxx/asset`），不区分项目画布和临时画布
- 服务端根据 projectId 有无决定解析根：项目根目录 或 全局临时目录
- 返回路径：有 projectId 返回 saveDir 相对路径，无 projectId 返回全局相对路径（相对 `~/.openloaf/`）
- 详见 `board-canvas-development/media-generation.md`

---

## 常见场景

| 场景 | 推荐参数 |
|------|----------|
| 项目文件读写 | `projectId + uri` |
| 项目内搜索 | `projectId + rootUri + query` |
| 跨项目搜索 | `searchWorkspace({ query })` |
| 全局配置目录文件 | `uri`（不传 `projectId`） |
| Electron 本地导入 | `projectId + uri + sourcePath` |
| 项目画布媒体保存 | `projectId + saveDir`（相对路径） |
| 临时画布媒体保存 | `saveDir`（相对路径，不传 `projectId`） |

---

## 兼容层说明

以下内容仍会保留 `workspace` 命名，但属于兼容层：

- `packages/api/src/services/workspaceProjectConfig.ts`
  - 实际语义：legacy project registry
- `packages/api/src/types/workspace.ts`
  - 实际语义：对旧消费者暴露的 synthetic workspace 形状
- `packages/api/src/services/appConfigService.ts`
  - `getActiveWorkspaceConfig()` / `getWorkspaces()` 等仅做兼容导出
- `apps/web/src/components/workspace/*`
  - 启动期 cookie / 旧桌面入口兼容

结论：

- **可以读取**
- **不要在新代码继续扩散**

---

## 开发检查清单

### 新增后端文件接口

1. 输入优先使用 `projectId?` + `uri`
2. 路径解析统一走 `resolveScopedPath()`
3. 需要根目录时优先走 `resolveScopedRootPath()`
4. 无 projectId 的媒体保存场景走 `getResolvedTempStorageDir()`
5. 不新增 `workspaceId` 新依赖

### 新增前端文件调用

1. 只传相对路径 / `file://` URI
2. 用 `projectId` 表达项目作用域
3. **不需要**在前端判断 projectId 是否为空再选择路径策略
4. 仅在 legacy 兼容链路里保留 `workspaceId`

### 文档同步要求

如果这些文件发生变化，需要同步更新本页：

- `packages/api/src/services/vfsService.ts`
- `packages/api/src/services/workspaceProjectConfig.ts`
- `packages/api/src/routers/fs.ts`
- `apps/server/src/modules/media/hlsService.ts`
- `apps/server/src/ai/services/image/attachmentResolver.ts`
- `apps/server/src/ai/services/image/imageStorage.ts`（`getResolvedTempStorageDir`）
- `apps/server/src/ai/services/video/videoStorage.ts`

---

## 关键代码位置

- `packages/api/src/services/vfsService.ts` — 核心路径解析
- `packages/api/src/services/workspaceProjectConfig.ts` — legacy project registry
- `packages/api/src/services/appConfigService.ts` — 兼容导出
- `packages/api/src/routers/fs.ts` — tRPC 文件路由
- `apps/server/src/modules/media/hlsService.ts` — HLS 媒体路径
- `apps/server/src/ai/services/image/imageStorage.ts` — 图片保存 + `getResolvedTempStorageDir()`
- `apps/server/src/ai/services/image/attachmentResolver.ts` — 附件解析
- `apps/server/src/ai/services/video/videoStorage.ts` — 视频保存
- `apps/server/src/modules/saas/modules/media/mediaProxy.ts` — SaaS 媒体轮询 + 返回路径
- `apps/server/src/modules/saas/modules/media/mediaTaskStore.ts` — 任务上下文持久化
- `apps/web/src/components/board/core/boardFilePath.ts` — 前端 boardFolderScope 解析
- `apps/web/src/components/file/lib/recent-open.ts` — 最近打开
- `apps/web/src/lib/image/uri.ts` — 图片 URI 兼容
