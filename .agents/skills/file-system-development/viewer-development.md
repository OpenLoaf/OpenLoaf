# Viewer Development

## 添加新 Viewer：3 步流程

### Step 1: 创建 Viewer 组件

```typescript
// components/file/MyFormatViewer.tsx
type MyFormatViewerProps = {
  uri?: string          // 文件 URI
  openUri?: string      // 原始打开路径（用于系统打开）
  name?: string         // 显示名称
  ext?: string          // 文件扩展名
  projectId?: string    // 项目 ID（tRPC 查询作用域）
  rootUri?: string      // 工作区根路径
  readOnly?: boolean    // 是否只读
  panelKey?: string     // Stack 面板 ID
  tabId?: string        // Tab ID
}

export default function MyFormatViewer({ uri, name, ext, projectId, rootUri, readOnly }: MyFormatViewerProps) {
  const { workspace } = useWorkspace()
  const workspaceId = workspace?.id ?? ''

  // 使用 tRPC 读取文件内容
  const { data, isLoading, error } = useQuery(
    trpc.fs.readFile.queryOptions({
      workspaceId,
      projectId,
      uri: uri ?? '',
    })
  )

  if (error) return <ReadFileErrorFallback uri={uri} name={name} projectId={projectId} rootUri={rootUri} error={error} />
  if (isLoading) return <LoadingSpinner />

  return (
    <div className="h-full w-full">
      {/* 渲染内容 */}
    </div>
  )
}
```

### Step 2: 注册类型映射

在 `file-viewer-target.ts` 的 `resolveFileViewerTarget()` 中添加：

```typescript
import { MY_FORMAT_EXTS } from "@/components/project/filesystem/components/FileSystemEntryVisual"

// 在 resolveFileViewerTarget 函数中添加分支
if (MY_FORMAT_EXTS.has(ext)) return { viewer: "my-format", ext }
```

同时在 `file-preview-types.ts` 中扩展 `FilePreviewViewer` 类型：

```typescript
export type FilePreviewViewer =
  | "image" | "markdown" | "code" | "pdf" | "doc" | "sheet" | "video" | "file"
  | "my-format"  // 新增
```

### Step 3: 添加渲染路由

需要在 **三个位置** 添加渲染分支：

1. **`open-file-preview.tsx`** — `renderFilePreviewContent()` switch 分支（嵌入式渲染）
2. **`open-file.ts`** — `buildStackItemForEntry()` switch 分支（Stack 面板）
3. **`FilePreviewDialog.tsx`** — 条件渲染分支（Modal 弹窗）

```typescript
// open-file-preview.tsx
case "my-format":
  return <MyFormatViewer uri={entry.uri} name={displayName} ext={ext} projectId={projectId} readOnly={readOnly} />

// open-file.ts → buildStackItemForEntry()
case "my-format":
  return {
    id: input.entry.uri,
    component: "my-format-viewer",
    title: input.entry.name,
    params: { ...baseParams, rootUri: input.rootUri, projectId: input.projectId, readOnly: input.readOnly },
  }

// FilePreviewDialog.tsx
{payload.viewer === "my-format" ? (
  <MyFormatViewer uri={currentItem.uri} name={currentItem.name} ext={currentItem.ext}
    projectId={currentItem.projectId} rootUri={currentItem.rootUri} readOnly={payload.readOnly} />
) : null}
```

## 现有 Viewer 参考

| Viewer | type | 行数 | 核心库 | 特点 |
|--------|------|------|--------|------|
| ImageViewer | `image` | 1074 | react-zoom-pan-pinch | 缩放平移、Canvas 蒙版编辑、保存导出 |
| SheetViewer | `sheet` | 681 | Univer | 高级表格 UI、公式支持 |
| CodeViewer | `code` | 673 | Monaco | 语言高亮、编辑/保存、撤销 |
| TerminalViewer | — | 605 | xterm | WebSocket、多标签 |
| MarkdownViewer | `markdown` | 577 | Streamdown + Shiki | MDX 占位、编辑/预览切换 |
| ExcelViewer | `sheet` | 503 | SheetJS (xlsx) | 只读 DataGrid 表格 |
| DocViewer | `doc` | 468 | Plate.js | DOCX 导入导出、Block 工具栏 |
| VideoViewer | `video` | 453 | HLS.js | m3u8 流、进度保存、品质选择 |
| FilePreviewDialog | — | 306 | — | 弹窗容器、导航控件、尺寸计算 |
| PdfViewer | `pdf` | 244 | react-pdf + pdfjs | 缩放、页码导航 |
| FileViewer | `file` | 183 | — | 文本/二进制通用 fallback |

## 统一 Props 模式

所有 Viewer 组件遵循相同的 Props 模式：

```typescript
// 必需
uri?: string           // 文件 URI（tRPC 查询用）
// 常用
name?: string          // 显示名称
ext?: string           // 扩展名（语言识别等）
projectId?: string     // 项目 ID（tRPC 查询作用域）
rootUri?: string       // 工作区根路径（系统打开/路径解析）
readOnly?: boolean     // 只读模式
// 可选
openUri?: string       // 原始路径（PDF 需要相对路径）
panelKey?: string      // Stack 面板 ID
tabId?: string         // Tab ID
```

**特殊 Props**：
- ImageViewer: `showHeader`, `showSave`, `enableEdit`, `initialMaskUri`, `onImageMeta`, `onApplyMask`, `saveDefaultDir`
- VideoViewer: `thumbnailSrc`, `width`, `height`, `forceLargeLayout`

## 文件类型映射

```typescript
// file-viewer-target.ts
IMAGE_EXTS   → "image"     // jpg, png, gif, svg, webp, ...
MARKDOWN_EXTS → "markdown" // md, mdx
CODE_EXTS    → "code"      // js, ts, py, json, yaml, ...
PDF_EXTS     → "pdf"       // pdf
DOC_EXTS     → "doc"       // 仅 docx（doc 走 "file" fallback）
SPREADSHEET_EXTS → "sheet" // xlsx, xls, csv
VIDEO_EXTS   → "video"     // mp4, mov, mkv, webm, ...
其他          → "file"      // 通用文本/二进制 fallback

// isTextFallbackExt() → "code"  // 无扩展名或未知文本类型
```

## 错误处理模式

```typescript
// ReadFileErrorFallback 组件
import { ReadFileErrorFallback, isFileTooLargeError } from "@/components/file/lib/read-file-error"

// 用法：在 Viewer 的错误状态中渲染
if (error) {
  return (
    <ReadFileErrorFallback
      uri={uri}
      name={name}
      projectId={projectId}
      rootUri={rootUri}
      error={error}
      tooLarge={isFileTooLargeError(error)}  // 自动检测大文件错误
    />
  )
}

// 行为：
// - 大文件：显示"文件过大"提示 + 系统打开(Electron)/下载(Web) 按钮
// - 其他错误：显示错误信息 + 重试提示
```

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 只在一个位置添加渲染分支 | 必须同时更新 3 个位置：renderFilePreviewContent + buildStackItemForEntry + FilePreviewDialog |
| 忘记扩展 `FilePreviewViewer` 类型 | 在 `file-preview-types.ts` 中添加新类型 |
| 不处理大文件错误 | 使用 `ReadFileErrorFallback` + `isFileTooLargeError()` |
| PDF 使用绝对路径 | PDF 需要相对路径（`getRelativePathFromUri`）|
| Video 不传 width/height | 弹窗尺寸计算依赖 `width`/`height` |
| 忘记 `__customHeader` 参数 | Markdown/PDF/Doc/Sheet/Video 在 Stack 中需要 `__customHeader: true` |
