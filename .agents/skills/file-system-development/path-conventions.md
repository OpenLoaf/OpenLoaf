# 文件路径规范

> **术语映射**：本文中「工作区」指代码中的 workspace（工作空间，顶层容器），「项目」指代码中的 project（工作区，工作空间下的文件夹）。产品面向用户时：workspace → 工作空间，project → 工作区。

OpenLoaf 的文件路径系统基于**作用域隔离 + ID 标识 + 服务端解析**的设计原则。前端永远不传递绝对路径或根目录路径，而是通过 ID 参数让服务端内部确定实际文件位置。

## 核心安全原则

> **前端永远不传 rootPath / 绝对路径。** 所有文件定位通过 `workspaceId` + `projectId` + `boardId` 等 ID 参数，由服务端内部解析为实际路径。这防止了路径穿越攻击。

---

## 一、目录结构约定

### 1.1 全局配置目录

```
~/.openloaf/                        # OpenLoaf 根配置目录
├── workspaces.json                 # 所有工作区配置
├── openloaf.db                     # SQLite 数据库
├── settings.json                   # 用户设置
├── providers.json                  # AI Provider 配置
├── auth.json                       # 认证信息
└── local-auth.json                 # 离线认证信息
```

- **位置确定**：`getOpenLoafRootDir()` (`packages/config/src/openloaf-paths.ts`)
- **数据库 URL**：默认 `file:~/.openloaf/openloaf.db`，可通过 `OPENLOAF_DATABASE_URL` 覆盖

### 1.2 工作区目录

```
<workspace_root>/                   # 工作区根目录
├── .openloaf/                      # 工作区元数据
│   ├── workspace.json              # 项目映射和排序
│   └── boards/                     # 画布存储
│       ├── board_20260309_xxx/
│       │   ├── index.tnboard       # 画布主文件
│       │   └── asset/              # 画布资源
│       └── ...
├── .openloaf-cache/                # 缓存目录
│   └── hls/                        # HLS 转码缓存
│       └── <sha256_cacheKey>/
│           ├── 1080p/
│           ├── 720p/
│           ├── source/
│           └── thumbnails/
└── <project_dirs>/                 # 项目目录
```

- **默认位置**：macOS `~/Documents/OpenLoafWorkspace`，Linux `~/OpenLoafWorkspace`
- **位置确定**：`getWorkspaceRootPathById(workspaceId)` (`packages/api/src/services/workspaceConfig.ts`)

### 1.3 项目目录

```
<project_root>/                     # 项目根目录
├── .openloaf/
│   ├── project.json                # 项目元数据 + 子项目映射
│   ├── boards/                     # 项目级画布
│   └── chat-history/               # AI 聊天附件
│       └── <sessionId>/
│           └── 20260309_143052_123.jpg
└── <user_files>/                   # 用户文件
```

- **位置确定**：`getProjectRootPath(projectId, workspaceId?)` (`packages/api/src/services/vfsService.ts`)

### 1.4 Board 画布目录

```
<scope_root>/.openloaf/boards/<boardId>/
├── index.tnboard                   # 画布数据
├── index.tnboard.json              # 可选，导出格式
├── index.tnboard.meta.json         # 可选，元信息
├── asset/                          # 画布资源
│   ├── image1.png
│   ├── video1.mp4
│   └── ...
└── chat-history/                   # 画布内聊天文件（boardId + sessionId 同时存在时）
    └── <sessionId>/
        ├── root/                   # 用户上传文件 & AI 生成文件
        │   └── file.txt
        └── 20260309_143052_123.jpg # 聊天图片附件
```

- **boardId 格式**：`board_<yyyyMMdd>_<HHmmss>_<random8>` 或遗留格式 `tnboard_<title>`
- **前端路径**：画布内资源存储相对于 board 目录的路径（如 `asset/video.mp4`）
- **后端解析**：收到 `boardId` 后自动补前缀 `.openloaf/boards/<boardId>/`
- **画布内聊天**：当 `boardId` + `chatSessionId` 同时存在时，聊天文件存储在画布目录下的 `chat-history/<sessionId>/`，而非项目/工作区级的 `chat-history/`

---

## 二、作用域与 ID 标识

### 2.1 三级作用域

| 作用域 | ID 参数 | 根目录确定方式 | 使用场景 |
|--------|---------|---------------|---------|
| Workspace | `workspaceId` | `workspaces.json` → `rootUri` | 工作区级文件操作 |
| Project | `projectId` (+`workspaceId`) | `workspace.json` → 项目映射 | 项目级文件操作 |
| Board | `boardId` (+`projectId`/`workspaceId`) | `<scope_root>/.openloaf/boards/<boardId>/` | 画布内资源 |
| Board Chat | `boardId` + `sessionId` | `<board_dir>/chat-history/<sessionId>/` | 画布内聊天文件 |

### 2.2 作用域优先级

服务端解析路径时的优先级：
1. 若同时有 `projectId` + `workspaceId` → 基于**项目根目录**
2. 若仅有 `workspaceId` → 基于**工作区根目录**
3. `boardId` 作为额外前缀叠加（在上述根目录基础上补 `.openloaf/boards/<boardId>/`）

---

## 三、前端路径格式

### 3.1 支持的路径格式（`resolveScopedPath` 解析）

| 格式 | 示例 | 解析规则 |
|------|------|---------|
| `file://` URI | `file:///Users/zhao/file.txt` | 直接转本地路径 |
| 绝对路径 | `/Users/zhao/file.txt` | 直接使用 |
| `@` 前缀 | `@/src/index.ts`、`@src/file.txt` | 相对于当前作用域根 |
| `[projectId]` 前缀 | `[proj_abc]/path/file.txt` | 跨项目引用 |
| 相对路径 | `src/file.txt`、`asset/video.mp4` | 相对于当前作用域根 |

### 3.2 前端 API 调用时的参数传递

```typescript
// ✅ 正确做法：传递 ID + 相对路径
fetch(`/media/hls/manifest?path=asset/video.mp4&workspaceId=${wsId}&projectId=${projId}&boardId=${boardId}`)

// ❌ 错误做法：传递绝对路径或 rootPath
fetch(`/media/hls/manifest?path=${absolutePath}&rootPath=${rootPath}`)
```

### 3.3 各场景的参数组合

| 场景 | path | projectId | workspaceId | boardId | sessionId |
|------|------|-----------|-------------|---------|-----------|
| 项目内文件 | 项目相对路径 | ✅ | ✅ | - | - |
| 工作区文件 | 工作区相对路径 | - | ✅ | - | - |
| Board 内资源 | board 相对路径 | ✅/- | ✅ | ✅ | - |
| 项目级 Chat 附件 | `.openloaf/chat-history/...` | ✅/- | ✅ | - | ✅ |
| 画布内 Chat 附件 | `chat-history/<sessionId>/...` | ✅/- | ✅ | ✅ | ✅ |

---

## 四、服务端路径解析

### 4.1 核心解析函数

| 函数 | 位置 | 功能 |
|------|------|------|
| `resolveScopedPath()` | `packages/api/src/services/vfsService.ts` | 解析 5 种格式路径为绝对路径 |
| `resolveScopedRootPath()` | 同上 | 获取作用域根目录 |
| `getProjectRootPath()` | 同上 | 从 projectId 获取项目根 |
| `getWorkspaceRootPathById()` | `packages/api/src/services/workspaceConfig.ts` | 从 workspaceId 获取工作区根 |
| `resolveScopedFilePath()` | `apps/server/src/modules/media/hlsService.ts` | HLS 专用路径解析（含 boardId 前缀） |

### 4.2 安全检查链

```
输入：{ path, projectId?, workspaceId?, boardId? }
  │
  ├─ 1. boardId 前缀化
  │     若有 boardId → path = `.openloaf/boards/<boardId>/<path>`
  │
  ├─ 2. 路径归一化 (normalizeRelativePath)
  │     移除 `./` 前缀、前导 `/`、`\` → `/`
  │
  ├─ 3. 路径穿越检查 (hasParentTraversal)
  │     拒绝包含 `..` 的路径 → return null
  │
  ├─ 4. 根目录确定
  │     projectId → getProjectRootPath()
  │     workspaceId → getWorkspaceRootPathById()
  │
  ├─ 5. 绝对路径拼接
  │     absPath = path.resolve(rootPath, relativePath)
  │
  └─ 6. 边界验证
        absPath 必须 startsWith(rootPath + path.sep)
        否则 → return null（路径穿越攻击被拒绝）
```

### 4.3 HLS Token 机制

HLS 片段和缩略图通过 token 保护，避免直接 URL 访问：

```
Token 格式：workspaceId::projectId::cacheKey::quality
示例：ws-uuid::proj-abc::sha256hash::720p

Cache Key 生成：SHA256(relativePath + fileSize + fileMtime)
```

---

## 五、各模块路径处理方式

### 5.1 文件系统 tRPC (`packages/api/src/routers/fs.ts`)

```typescript
// 所有操作统一接收 scope ID + 相对 URI
input: { workspaceId: string, projectId?: string, uri: string }
// 服务端通过 resolveScopedPath() 解析为绝对路径
```

### 5.2 HLS 媒体 (`apps/server/src/modules/media/hlsService.ts`)

```typescript
// manifest / progress / thumbnails 端点
input: { path: string, projectId?: string, workspaceId?: string, boardId?: string }
// 通过 resolveScopedFilePath() 解析，boardId 自动补前缀

// segment / thumbnail 端点
input: { token: string, name: string }
// 从 token 中解析 projectId/workspaceId/cacheKey/quality
```

### 5.3 Chat 文件上传（两条链路）

Chat 有两条文件上传链路，返回路径格式不同：

#### 5.3.1 图片附件 — `POST /chat/attachments`

```typescript
body: { file: File | string, workspaceId, projectId?, sessionId }
// 存储到 <scope_root>/.openloaf/chat-history/<sessionId>/<timestamp>.<ext>
// 返回相对路径（如 ".openloaf/chat-history/sid/20260309_143052_123.jpg"）

// 前端引用格式
"@{.openloaf/chat-history/sessionId/20260309_143052_123.jpg}"
// AI Agent 通过 parseScopedRelativePath() 解析
// 安全检查：拒绝 ..、拒绝 scheme URL、边界验证
```

#### 5.3.2 通用文件拖拽 — `POST /chat/files`

```typescript
body: { file: File, workspaceId, projectId?, sessionId }
// 存储到 <sessionDir>/root/<filename>（绝对路径）
// 返回绝对路径（因为 AI agent 的 shell/coder 工具需要绝对路径操作文件）

// 前端引用格式
"@{/abs/path/to/session/root/file.txt}"
// 注意：绝对路径由服务端生成返回，不是前端构造
```

#### 5.3.3 画布内聊天（规划中）

当 `boardId` + `chatSessionId` 同时存在时，表示在画布内进行聊天。此时聊天文件存储在画布目录下：

```typescript
// 存储路径
<scope_root>/.openloaf/boards/<boardId>/chat-history/<sessionId>/
├── root/                   # 用户上传文件 & AI 生成文件
└── <timestamp>.<ext>       # 图片附件

// 服务端解析：boardId 确定画布目录 → 在其下查找 chat-history/<sessionId>/
// 优势：画布移动/导出时聊天文件一并迁移，数据局部性更好
```

### 5.4 Board 画布 (`packages/api/src/routers/board.ts`)

```typescript
// 创建画布
board.create({ workspaceId, projectId?, title? })
// → 生成 boardId，创建 <scope_root>/.openloaf/boards/<boardId>/

// 画布内资源引用
// 前端存储：相对于 board 目录的路径（如 "asset/video.mp4"）
// 服务端：boardId → 自动补 ".openloaf/boards/<boardId>/" 前缀
```

### 5.5 文件监视 SSE (`apps/server/src/modules/fs/fileSseRoutes.ts`)

```typescript
GET /fs/watch?workspaceId=xxx&projectId=yyy&dirUri=path
// 通过 resolveScopedPath() 解析监视目录
// SSE 推送变更事件
```

### 5.6 AI Tool 作用域 (`apps/server/src/ai/tools/toolScope.ts`)

```typescript
resolveToolPath(raw, scope)
// 返回 { absPath, scope: "workspace" | "project" | "external" }
// 外部路径需用户审批
```

---

## 六、前端路径工具

### 6.1 Board 路径解析 (`apps/web/src/components/board/core/boardFilePath.ts`)

```typescript
// 解析画布内资源路径为项目相对路径
resolveProjectPathFromBoardUri({
  uri: "asset/video.mp4",
  boardFolderScope: ".openloaf/boards/board_xxx",
  currentProjectId?: string,
  rootUri?: string,
})
// → ".openloaf/boards/board_xxx/asset/video.mp4"（项目相对路径）

// 获取 board 目录范围
resolveBoardFolderScope(fileContext?: BoardFileContext)
// → ".openloaf/boards/board_xxx" 或 ""
```

### 6.2 文件 URI 工具 (`packages/api/src/services/fileUri.ts`)

```typescript
normalizeFileUri(raw)        // 统一为 file:// URI
resolveFilePathFromUri(uri)  // file:// → 本地路径
toFileUri(path)              // 本地路径 → file://（URL 编码）
```

---

## 七、开发规范

### 7.1 新增 API 端点

1. **接收参数**：使用 `workspaceId` + `projectId` + `boardId`，不接收 `rootPath` / 绝对路径
2. **路径解析**：使用 `resolveScopedPath()` 或 `resolveScopedFilePath()`
3. **安全检查**：确保结果路径在作用域根目录内
4. **错误处理**：路径解析失败返回 404，不暴露服务端路径信息

### 7.2 前端传参

1. **文件路径**：传项目/工作区/board 相对路径
2. **ID 参数**：传 `workspaceId`、`projectId`、`boardId`
3. **绝对路径**：仅在 Electron 环境通过 IPC 使用，HTTP API 禁止

### 7.3 路径存储

1. **数据库**：存储相对路径或 `file://` URI（`folderUri`、`rootUri`）
2. **画布文件**：存储相对于 board 目录的路径
3. **Chat 消息**：存储 `@{相对路径}` 格式引用
4. **配置文件**：工作区内项目用相对路径，跨工作区用 `file://` URI

### 7.4 禁止事项

- ❌ 前端传 `rootPath` 或绝对路径到 HTTP API
- ❌ 服务端在响应中暴露绝对路径
- ❌ 允许 `..` 路径穿越
- ❌ 不验证路径是否在作用域内就直接使用
- ❌ 在画布中存储绝对路径（会导致换设备后资源失效）

---

## 八、关键代码位置

| 文件 | 用途 |
|------|------|
| `packages/config/src/openloaf-paths.ts` | 全局配置路径 |
| `packages/api/src/services/vfsService.ts` | 核心路径解析 |
| `packages/api/src/services/workspaceConfig.ts` | 工作区配置读写 |
| `packages/api/src/services/workspaceProjectConfig.ts` | 项目配置读写 |
| `packages/api/src/services/fileUri.ts` | URI 转换工具 |
| `packages/api/src/routers/fs.ts` | 文件系统 tRPC 路由 |
| `packages/api/src/routers/board.ts` | 画布路由 |
| `apps/server/src/modules/media/hlsService.ts` | HLS 路径解析 |
| `apps/server/src/ai/services/image/attachmentResolver.ts` | Chat 附件路径解析 |
| `apps/server/src/ai/tools/toolScope.ts` | AI Tool 作用域 |
| `apps/web/src/components/board/core/boardFilePath.ts` | 画布路径工具 |
