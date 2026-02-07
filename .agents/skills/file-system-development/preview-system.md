# Preview System

## 核心类型

### FilePreviewViewer

```typescript
type FilePreviewViewer = "image" | "markdown" | "code" | "pdf" | "doc" | "sheet" | "video" | "file"
```

### FilePreviewItem

```typescript
type FilePreviewItem = {
  uri: string               // 文件 URI
  openUri?: string          // 原始打开路径
  name?: string             // 显示名称
  title?: string            // 标题（用于头部）
  ext?: string              // 扩展名
  projectId?: string        // 项目 ID
  rootUri?: string          // 根路径
  width?: number            // 媒体宽度（视频弹窗尺寸计算用）
  height?: number           // 媒体高度
  thumbnailSrc?: string     // 缩略图
  mediaType?: string        // MIME 类型
  maskUri?: string          // 图像蒙版 URI
  saveName?: string         // 保存文件名
}
```

### FilePreviewPayload

```typescript
type FilePreviewPayload = {
  viewer: FilePreviewViewer       // 查看器类型
  items: FilePreviewItem[]        // 预览项列表（图像支持多个）
  activeIndex: number             // 当前显示索引
  readOnly?: boolean              // 只读模式
  sourceId?: string               // 来源 ID（用于协调）
  showSave?: boolean              // 显示保存按钮
  enableEdit?: boolean            // 启用编辑模式
  saveDefaultDir?: string         // 保存默认目录
  onClose?: () => void            // 关闭回调
  onApplyMask?: (input) => void   // 蒙版编辑回调
  onActiveIndexChange?: (index: number) => void  // 图像导航回调
}
```

## FilePreviewStore (Zustand)

```typescript
// file-preview-store.ts
const useFilePreviewStore = create<FilePreviewState>((set, get) => ({
  payload: null,
  openPreview: (payload) => set({ payload }),
  closePreview: () => {
    get().payload?.onClose?.()     // 关闭时触发回调清理
    set({ payload: null })
  },
}))

// 便利函数（可在组件外调用）
openFilePreview(payload)     // 打开预览弹窗
closeFilePreview()           // 关闭预览弹窗
```

## 三种打开模式

### FileOpenMode

```typescript
type FileOpenMode = "stack" | "modal" | "embed"
```

### 流程

```
openFilePreview(input: FileOpenInput)
  ├─ Board 文件夹 → pushStackItem("board-viewer")
  ├─ 普通文件夹 → onNavigate(uri) 或 embed 渲染
  └─ 文件
      ├─ "embed" → renderFilePreviewContent() → ReactNode
      ├─ Office 不支持 → shouldOpenOfficeWithSystem() → 系统打开
      ├─ "modal" → buildPreviewPayload() → openFilePreviewDialog()
      └─ "stack" → buildStackItemForEntry() → pushStackItem()
```

### Stack 模式（默认）

在 Tab 的 Stack 面板中打开文件：

```typescript
const stackItem = buildStackItemForEntry({
  entry, projectId, rootUri, thumbnailSrc, readOnly
})
// → { id, component, title, params }
useTabRuntime.getState().pushStackItem(tabId, stackItem)
```

每种 Viewer 对应一个 `component` 标识：`"image-viewer"`, `"markdown-viewer"`, `"code-viewer"`, `"pdf-viewer"`, `"doc-viewer"`, `"sheet-viewer"`, `"video-viewer"`, `"file-viewer"`。

### Modal 模式

全屏弹窗预览，通过 Zustand Store 驱动：

```typescript
const payload = buildPreviewPayload({ viewer, entry, projectId, rootUri, ... })
openFilePreviewDialog(payload)

// FilePreviewDialog 组件消费 Store
const payload = useFilePreviewStore((state) => state.payload)
```

**弹窗尺寸**：
- 图像：`getImageDialogSize(meta)` — 根据图片实际尺寸和视窗计算
- 视频：`getVideoDialogSize({ width, height })` — 等比缩放适配视窗
- 其他：`90vw × 90vh` 固定尺寸

**图像导航**：多图预览时显示上/下一张按钮，通过 `onActiveIndexChange` 回调切换。

### Embed 模式

嵌入式渲染，返回 ReactNode：

```typescript
const content = renderFilePreviewContent({
  entry, rootUri, projectId, readOnly
})
// content 是 ReactNode，可直接渲染到任何容器
```

## 类型路由

```typescript
// resolveFileViewerTarget(entry) → { viewer, ext } | null
// 仅处理 kind === "file" 的条目

IMAGE_EXTS      → "image"
MARKDOWN_EXTS   → "markdown"
CODE_EXTS / isTextFallbackExt → "code"
PDF_EXTS        → "pdf"
DOC_EXTS(仅docx) → "doc"    // doc 走 "file" fallback
SPREADSHEET_EXTS → "sheet"
VIDEO_EXTS      → "video"
其他             → "file"
```

### Office 文件系统打开

```typescript
shouldOpenOfficeWithSystem(ext: string): boolean
// doc → true（系统打开）
// docx → false（内置 DocViewer）
// xls/xlsx/csv → false（内置 SheetViewer）
// ppt/pptx → true（系统打开）
```

## FileOpenInput

```typescript
type FileOpenInput = {
  entry: FileSystemEntry       // 目标条目
  tabId?: string | null        // Stack 模式需要
  projectId?: string           // 项目 ID
  rootUri?: string             // 工作区根路径
  thumbnailSrc?: string        // 缩略图
  mode?: FileOpenMode          // 打开模式（默认 "stack"）
  confirmOpen?: (msg) => boolean  // 不支持类型确认回调
  onNavigate?: (uri) => void   // 文件夹导航回调
  readOnly?: boolean           // 只读标记
  board?: { pendingRename?: boolean }  // Board 选项
  modal?: { showSave?, enableEdit?, saveDefaultDir? }  // Modal 选项
}
```

## 最近打开 (recent-open.ts)

### 存储结构

```typescript
type RecentOpenStore = {
  workspace: RecentOpenItem[]                    // 工作区级
  projects: Record<string, RecentOpenItem[]>    // 项目级
}
// localStorage key: `tenas:recent-open:${workspaceId}`
```

### API

```typescript
recordRecentOpen({
  tabId?, workspaceId?, projectId?, entry,
  maxItems?: 5     // 每个作用域保留条数
})

getRecentOpens({
  workspaceId?, projectId?,
  limit?: 5
}) → { workspace: RecentOpenItem[], project: RecentOpenItem[] }
```

### 通知

```typescript
// 记录后广播 CustomEvent
window.dispatchEvent(new CustomEvent("tenas:recent-open", { detail: { workspaceId } }))
```

监听方可通过 `addEventListener("tenas:recent-open", ...)` 实时更新最近打开列表。

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| Modal 关闭不触发 `onClose` | `closePreview()` 已自动调用 `payload.onClose?.()` |
| Stack 模式不传 `tabId` | 没有 `tabId` 会 toast 错误 |
| PDF 使用绝对 URI | PDF 需要 `getRelativePathFromUri()` 转相对路径 |
| Office 文件直接预览 | 先检查 `shouldOpenOfficeWithSystem()` |
| 视频弹窗没有尺寸 | 必须传 `width`/`height` 给 FilePreviewItem |
| 最近打开不通知 | `recordRecentOpen` 已自动发 CustomEvent |
| Board 文件夹不特殊处理 | `openFilePreview` 已检测 `isBoardFolderName()` |
