# System Tools 设计方案（多项目）

## 目标
- 系统工具仅依赖请求上下文的 `projectId`，无需在工具参数中传入 `projectId`。
- 所有文件/命令类工具只能在当前项目根目录内执行，防止跨项目访问。
- 工具定义、风险分级、审批边界保持单一事实来源，避免重复维护。
- 工具输出统一为可序列化结构，便于 UI 与审计消费。

## 约束
- `projectId` 只允许从 `apps/server/src/ai/chat-stream/requestContext.ts` 获取。
- 路径默认使用当前 `projectId`，如需跨项目需显式传入 `[projectId]/...`。
- 访问路径必须落在 `getProjectRootPath(projectId)` 返回的根目录内。
- 搜索工具默认跳过 `.tenas`、`.git`、`node_modules` 等目录。

## 架构设计
### 1. 定义层（单一事实来源）
- 位置：`packages/api/src/types/tools/system.ts`
- 内容：
  - `id` / `description` / `parameters(zod)` / `needsApproval` / `component`
  - `systemToolMeta`：`riskType` 分级（read/write/destructive）

### 2. 注册层（可用工具集合）
- 位置：`apps/server/src/ai/registry/toolRegistry.ts`
- 作用：将 ToolDef.id 映射到 server 侧实现，并提供 `needsApproval`。
- 说明：`toolRegistry` 只允许引用 ToolDef.id，不手写字符串。

### 3. 执行层（工具实现）
- 位置：`apps/server/src/ai/tools/system/*.ts`
- 每个工具使用 `tool()` + `zodSchema()`，返回 `{ ok: true, data: ... }`。

### 4. 上下文层（projectId 来源）
- 位置：`apps/server/src/ai/chat-stream/requestContext.ts`
- 获取方式：`getProjectId()`
- 说明：SSE 请求在进入 tool 执行前已写入 requestContext。

## 业务逻辑（End-to-End）
1. 客户端发起 SSE 请求（包含 projectId）。
2. server 在 `chatStreamRoutes` 写入 requestContext。
3. agent 触发 toolCall。
4. tool 内部调用 `getProjectId()` 获取当前项目。
5. 工具解析路径、校验范围并执行。
6. 工具返回 `SystemToolResult<T>`。
7. UI 展示结果或审批流程。

## 代码逻辑（关键流程）
### A. 项目路径解析（核心逻辑）
建议新增统一 helper：`apps/server/src/ai/tools/system/projectPath.ts`

#### 输入
- `path: string`（相对路径或 `[projectId]/...`）

#### 输出
- `projectId`
- `rootPath`
- `absPath`
- `relativePath`

#### 逻辑步骤
1. 读取 `projectId = getProjectId()`，为空直接报错。
2. `rootPath = getProjectRootPath(projectId)`，为空报错。
3. 若传 `[projectId]/...`：
   - 解析出 `projectId` 与相对路径。
4. 若传相对路径：`absPath = path.resolve(rootPath, path)`。
5. 若传绝对路径：先 `path.resolve`，再校验在 `rootPath` 内。
6. 校验 `absPath` 必须位于 `rootPath` 内（防止 `..` 越界）。

### B. 文件工具逻辑
#### file-read
- 参数：`path`
- 有字节上限（默认 256KB），超出时直接报错。

#### file-read-excel
- 参数：`path`
- 仅支持 `.xlsx/.xls/.xlsm`，提取纯文本。
- 有字节与输出长度上限，超出时截断。
- 若包含图片，会从 `xl/media` 提取并保存到 `.tenas/chat/<sessionId>/`，返回相对路径引用（`.xls` 仅支持文本）。

#### file-read-docx
- 参数：`path`
- 仅支持 `.docx`，提取纯文本。
- 有字节与输出长度上限，超出时截断。
- 若包含图片，会从 `word/media` 提取并保存到 `.tenas/chat/<sessionId>/`，返回相对路径引用。

#### file-list
- 参数：`path?`
- 列出当前目录的一级文件与子目录。

#### file-search
- 参数：`path?` / `query` / `limit?`
- 广度遍历目录树（深度默认 12），跳过 `.git/.tenas/node_modules`。
- 文件名或内容包含关键字即命中，返回相对路径列表。

#### file-write
- 参数：`path` / `content` / `mode?`
- 需审批（write），写入前自动创建目录。

#### file-delete
- 需审批（destructive）。
- 仅允许删除文件，不允许删除目录。

### C. Shell 工具逻辑
#### shell-readonly
- 只允许白名单命令（例如 `date/pwd/ls`）。
- 运行目录固定为 `projectRoot`。
- `ls` 仅允许列出项目内路径。

#### shell-write / shell-destructive
- 限制到单一命令（如 `mkdir <path>` / `rm <file>`）。
- 参数必须是项目内相对路径。
- 走审批流程。

### D. Web 工具逻辑
#### web-fetch
- 仅允许 http/https。
- 限制最大响应大小、超时。
- 返回原始文本内容。

#### web-search
- 支持 query + limit。
- 通过 DuckDuckGo JSON 接口执行（MVP）。

## 工具清单（建议）
| Tool ID | 风险 | 说明 |
| --- | --- | --- |
| time-now | read | 获取服务器时间 |
| file-read | read | 读取项目内文件 |
| file-read-excel | read | 读取 Excel 并提取文本 |
| file-read-docx | read | 读取 Docx 并提取文本 |
| file-list | read | 列出目录 |
| file-search | read | 搜索文件内容 |
| file-write | write | 写入文件 |
| file-delete | destructive | 删除文件 |
| shell-readonly | read | 只读 shell |
| shell-write | write | mkdir |
| shell-destructive | destructive | rm |
| web-fetch | read | 抓取网页 |
| web-search | read | 搜索网页 |

## 风险与审批策略
- 风险分级来源：`systemToolMeta`。
- 审批开关：`toolRegistry` 基于 riskType 或 needsApproval 判断。
- write/destructive 必须审批，read 默认不需要。

## 输出结构
- 所有 system tools 返回 `{ ok: true, data: ... }`。
- 失败时直接抛错，由上层统一处理。

示例：
```json
{ "ok": true, "data": { "content": "..." } }
```

## 安全边界检查清单
- 是否存在 `projectId`。
- 是否存在 `projectRootPath`。
- scoped path 解析后 projectId 是否有效。
- `absPath` 是否在 rootPath 下。
- 是否访问敏感目录或隐藏目录。
- 输出是否受限（行数/字节）。

## 落地步骤
1. 新增 `projectPath` helper 并覆盖所有 file/shell 工具。
2. 补齐 system tools 实现（read/list/search/write/patch/delete/web/shell）。
3. 更新 ToolDef 参数（移除 projectId）。
4. 注册 toolRegistry 并在 MasterAgent 中配置工具列表。
5. 补充单测与手工验证清单。
