# 统一路径规则（草案）

## 目标
- 统一“路径/URI”的语义与转换规则，避免相同字符串在不同场景被误判。
- 禁止在 Web UI 与 SSE 载荷中出现 `file://`，统一用带项目 ID 的“绝对路径”表达。
- 明确“相对路径”的归属范围与解析方式。

## 核心定义

### 1) 跨项目绝对路径（仅跨项目引用）
- **格式**：`@[projectId]/path/to/file`
- **根目录**：项目根目录可表示为 `@[projectId]/`
- **要求**：`@[]` 符号必须保留，禁止去掉 `@` 或 `[]`。
- **语义**：以 `projectId` 对应的项目根目录为锚点的绝对路径。
- **使用范围**：仅用于“跨项目引用”。同项目内禁止使用该格式。
- **示例**：
  - `@[proj_parent]/docs/readme.md`
  - `@[proj_parent]/.tenas/chat/chat_xxx/20240101_000000.png`

### 1.5) 当前项目根路径别名（仅同项目）
- **格式**：`@path/to/file`
- **根目录**：当前项目根目录可表示为 `@`
- **语义**：仅作为当前项目根目录的别名，解析时等同于项目相对路径。
- **使用范围**：仅用于同项目引用，对外输出必须归一化为项目相对路径（去掉 `@`）。
- **约束**：禁止使用 `@/` 或 `@\\` 前缀。
- **示例**：
  - `@docs/readme.md`
  - `@excel/125_1.xls`

### 2) 相对路径（除“项目绝对路径 / 当前项目根别名”以外的所有无 scheme 路径）
- **判定**：不匹配 `^@\\[[^\\]]+\\]/` 且不匹配 `^@[^\\[]`，且不包含 URI scheme（`file://`/`http(s)`/`data:`/`blob:`）。
- **子类型**：
  - **Board 相对路径**：推荐固定前缀 `.asset/`，表示相对当前 board 文件夹。
    - 示例：`.asset/20240101_000000.png`
  - **项目相对路径**：相对项目根目录（project root）。
    - 示例：`.tenas/chat/chat_xxx/20240101_000000.png`
    - 示例：`docs/notes.md`

### 3) 仅允许的 URI scheme
- **允许在 UI 中直接使用**：`data:` / `blob:` / `http(s):`
- **仅限 Electron/Server 内部使用**：`file://`
  - `file://` 不得出现在 Web UI 或 SSE payload 中。

## 解析与转换规则

### 规则 A：绝对路径优先
1) 若路径匹配 `@[projectId]/...` → 直接视为“项目绝对路径”。
2) 若 `projectId` 与当前项目一致 → **降级为项目相对路径**（去掉 `@[projectId]/`）。
3) `@[]` 必须保留，允许在服务端解析时临时去掉 `@`，但传输与持久化必须保留。

### 规则 A-1：当前项目根路径别名
- 若路径以 `@` 开头且不匹配 `@[projectId]/...` → 视为当前项目相对路径，解析时去掉 `@`。
- `@/` 与 `@\\` 禁止使用。

### 规则 B：相对路径按上下文解析
- **Board 场景**：`.asset/...` 视为“相对 board 目录”。
- **非 Board 场景**：相对路径默认视为“相对项目根目录”。

### 规则 C：UI 渲染必须走预览接口
- 任何相对路径（含 `.asset/` 与 `.tenas/...`）必须通过
  `/chat/attachments/preview?path=...` 转为可加载资源。
- 项目绝对路径也必须通过预览接口，`path` 参数可直接传 `@[projectId]/...`。

## 边界与职责

### Web UI
- 只处理以下类型：
  - `@[projectId]/...`
  - 相对路径（`.asset/...`、`.tenas/...`、`docs/...`）
  - `data:` / `blob:` / `http(s):`
- 禁止出现 `file://`。

### Server / Electron
- 允许使用 `file://`，但仅限内部文件系统访问与 IPC。
- **任何对外接口返回与持久化数据中禁止出现 `file://`**。
- 对外返回或落库时必须转换为：
  - `@[projectId]/...`（项目绝对路径）
  - 或相对路径（如 `.tenas/...`、`.asset/...`）

## 规范化建议

### 1) 统一“绝对路径”输出
- 输出格式必须为 `@[projectId]/...`，不得输出 `file://`。
- 从 `file://` 或本地绝对路径转换时，只能在 Server/Electron 内部完成映射，
  然后对外输出为 `@[projectId]/...`。
- **同项目内不得输出 `@[projectId]/...`**，应降级为项目相对路径。

### 2) 统一“相对路径”输出
- Board 资源统一写成 `.asset/<filename>`。
- Chat 附件统一写成 `.tenas/chat/<sessionId>/<filename>`。
- 其他项目文件保持项目相对路径形式（例如 `docs/notes.md`）。

### 3) 统一判断与归一化
- 绝对路径判定：`^@\\[[^\\]]+\\]/`
- 当前项目根路径别名判定：`^@[^\\[]`（禁止 `@/` 与 `@\\`）
- URI 判定：`^[a-zA-Z][a-zA-Z0-9+.-]*:`
- 任何包含 `..` 的相对路径都视为非法。

## 标准解析流程（伪代码）
```text
if hasScheme(path):
  return URI
if isProjectAbsolute(path):   # @[] 形式
  return ProjectAbsolute
if isProjectRootAlias(path):  # @path 形式
  return ProjectRelative
if inBoardContext and isBoardRelative(path):  # .asset/ 或 ./
  return BoardRelative
return ProjectRelative
```

## 渲染与访问规则
- **ProjectAbsolute** 与 **ProjectRelative**：
  - 一律通过 `/chat/attachments/preview?path=...` 获取可渲染资源。
- **BoardRelative**：
  - 先转换为项目路径（基于 boardFolder），再走预览接口。

## 示例
1) 跨项目绝对路径  
`@[proj_parent]/docs/readme.md`

2) 同项目内的路径（项目相对路径）  
`docs/readme.md`

2.5) 当前项目根路径别名  
`@docs/readme.md`

3) Chat 附件（项目相对路径）  
`.tenas/chat/chat_20260116_175840_wda2jopd/20260116_175914_470.png`

4) Board 资源（Board 相对路径）  
`.asset/20240101_000000.png`

5) Board 资源对外渲染（转换后）  
`@[proj_parent]/boards/tnboard_新建画布/.asset/20240101_000000.png`

## 约束清单
- UI 与 SSE payload 中禁止出现 `file://`。
- UI 内部选择、保存、事件传递必须使用 `@[projectId]/...` 或相对路径。
- `@[projectId]/...` 必须保留 `@` 与 `[]`，禁止去掉或替换。
- `@[projectId]/...` 仅用于跨项目引用；同项目必须降级为项目相对路径。
- `@` 仅作为当前项目根目录别名输入，对外输出必须归一化为项目相对路径。
- `@/` 与 `@\\` 禁止使用。
- `.asset/...` 仅在 Board 语境使用；脱离 Board 语境前必须转换为项目路径。
