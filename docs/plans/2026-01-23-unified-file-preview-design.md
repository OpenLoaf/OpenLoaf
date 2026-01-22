# 统一文件预览入口设计

## 背景与目标
当前文件预览存在多处入口与分发逻辑：
- 文件系统预览面板使用独立的组件分发逻辑。
- 双击打开使用 `handleFileSystemEntryOpen`，再间接依赖 `open-file.ts` 的类型判断。
- 系统默认打开与内置预览的判断分散在不同位置。

目标：在 `apps/web/src/components/file/lib/open-file.ts` 中提供唯一入口，统一三种展示方式：
1) stack 方式打开
2) 全屏预览（先等同于 modal 预览，仅样式层面可再扩展）
3) 嵌入到其他组件中显示

## 总体方案
采用单一入口函数 `openFilePreview`：
- 参数包含 `entry`、`mode`、`tabId`、`projectId`、`rootUri`、`thumbnailSrc`、`confirmOpen`、`onNavigate`、`modal`、`board`。
- 当 `mode === "embed"` 时返回 `ReactNode | null`，由调用方直接渲染。
- 当 `mode === "stack"` 或 `mode === "modal"` 时执行打开逻辑并返回 `void`。

核心逻辑在统一的类型解析与 viewer 映射上：
- 复用 `resolveFileViewerTarget`。
- 统一处理 board 目录与 board index 文件。
- 对不支持的 office 类型使用 `shouldOpenOfficeWithSystem` + confirm，再交系统默认打开。

## 具体设计
### 入口函数
在 `apps/web/src/components/file/lib/open-file.ts` 新增：

```ts
export type FileOpenMode = "stack" | "modal" | "embed";

export function openFilePreview(input: FileOpenInput & { mode: FileOpenMode }):
  | ReactNode
  | null
  | void;
```

### 嵌入预览渲染
在同文件内新增 `renderPreviewContent`：
- 输出与现有 `FileSystemEntryPreviewContent` 等价的 viewer 渲染。
- 作为唯一嵌入式渲染入口，避免分发逻辑重复。

### 双击/打开逻辑
`apps/web/src/components/project/filesystem/utils/entry-open.ts`：
- 保留双击策略与确认逻辑。
- 最终统一调用 `openFilePreview`。

### 预览面板改造
`apps/web/src/components/project/filesystem/components/FileSystemEntryPreviewContent.tsx`：
- 改为薄封装：仅调用 `openFilePreview({ mode: "embed" })` 并渲染返回值。
- 未来可视情况移除并由调用方直接使用 `openFilePreview`。

## 数据流
- stack：`openFilePreview` -> `buildStackItemForEntry` -> `useTabs`。
- modal（全屏预览）：`openFilePreview` -> `buildPreviewPayload` -> `openFilePreview` store。
- embed：`openFilePreview` -> `renderPreviewContent` -> 返回 `ReactNode`。

## 错误处理
- `openWithDefaultApp` 在 Web 环境时 toast 错误提示。
- `PdfViewer` 缺少 `projectId`/`rootUri` 时显示错误文案。
- `confirmOpen` 可替换 `window.confirm`。

## 迁移步骤
1) 实现 `openFilePreview` 与 `renderPreviewContent`。
2) 改造 `FileSystemEntryPreviewContent` 使用嵌入入口。
3) 改造 `entry-open.ts` 统一调用新入口。
4) 检查 `FileSystemColumns.tsx` / `FileSystemList.tsx` / `FileSystemGitTree.tsx` 行为一致。

## 验证
- 手动验证：预览面板展示、双击打开、系统默认打开提示。
- 类型检查：`pnpm check-types`。
