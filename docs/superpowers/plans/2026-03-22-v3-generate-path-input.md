# V3 Generate 接口改用 Path 输入

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端发送 board-relative path 代替 base64/localhost URL，后端直接读磁盘文件再走 S3/base64 上传。

**Architecture:** 前端 variant 组件传原始 board path（如 `asset/xxx.jpg`）+ boardId，而非 resolved URL。后端 `resolveLocalMediaInput` 新增 `path` 字段支持，通过 `resolveBoardDirFromDb` 查 DB 解析磁盘路径。用户上传文件先保存到画布 asset 目录再传 path。

**Tech Stack:** TypeScript, Hono, Prisma, boardPaths.ts

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| Modify | `apps/server/src/modules/saas/modules/media/mediaProxy.ts` | `resolveLocalMediaInput` 支持 `path` + `boardId` |
| Modify | `apps/web/src/components/board/panels/variants/shared/MediaSlot.tsx` | 上传文件改为先保存到 asset 目录 |
| Modify | `apps/web/src/components/board/panels/variants/image/*.tsx` | 传 path 代替 data URL |
| Modify | `apps/web/src/components/board/panels/variants/video/*.tsx` | 同上 |
| Modify | `apps/web/src/components/board/nodes/ImageNode.tsx` | upstream 传原始 path 给面板 |
| Modify | `apps/web/src/components/board/nodes/VideoNode.tsx` | 同上 |
| Modify | `apps/web/src/components/board/utils/board-asset.ts` | `saveBoardAssetFile` 确认可复用 |
| Modify | `apps/web/src/lib/saas-media.ts` | V3 请求类型更新 |

---

### Task 1: 后端 — `resolveLocalMediaInput` 支持 path 字段

**Files:**
- Modify: `apps/server/src/modules/saas/modules/media/mediaProxy.ts:168-236`

**核心逻辑:** 当 input 包含 `path` 字段（如 `asset/xxx.jpg`）时，结合 context 中的 `boardId`，通过 `resolveBoardDirFromDb` 查 DB 获取画布磁盘路径，直接读文件，再走三级上传策略（S3→SDK→base64）。

- [ ] **Step 1: 修改 `resolveLocalMediaInput`**

在函数开头，`url` 检查之前，新增 `path` 处理分支：

```typescript
// path-based input: board-relative path (e.g. "asset/xxx.jpg")
const inputPath = typeof input.path === 'string' ? input.path.trim() : '';
if (inputPath) {
  const boardId = context.boardId;
  if (!boardId) {
    logger.warn({ path: inputPath }, 'path input requires boardId in context');
    return input as ResolvedMediaInput;
  }
  const boardResult = await resolveBoardDirFromDb(boardId);
  if (!boardResult) {
    logger.warn({ boardId, path: inputPath }, 'Board not found for path input');
    return input as ResolvedMediaInput;
  }
  const absPath = path.resolve(boardResult.absDir, inputPath);
  // 安全检查：不能穿越画布目录
  if (!absPath.startsWith(path.resolve(boardResult.absDir) + path.sep)) {
    logger.warn({ absPath, boardDir: boardResult.absDir }, 'Path traversal rejected');
    return input as ResolvedMediaInput;
  }
  try {
    const buffer = await fs.readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mediaType = MEDIA_TYPE_MAP[ext] || 'application/octet-stream';
    return await uploadOrInlineBuffer(buffer, path.basename(absPath), mediaType, context, accessToken);
  } catch (err) {
    logger.warn({ err, absPath }, 'Failed to read board asset file');
    return input as ResolvedMediaInput;
  }
}
```

- [ ] **Step 2: 提取 `uploadOrInlineBuffer` 公共函数**

从 `resolveLocalMediaInput` 的现有 S3/SDK/base64 逻辑提取为独立函数，path 分支和 URL 分支共用：

```typescript
async function uploadOrInlineBuffer(
  buffer: Buffer,
  fileName: string,
  mediaType: string,
  context: MediaSubmitContext,
  accessToken?: string,
): Promise<ResolvedMediaInput> {
  // Strategy 1: S3
  const s3 = resolveActiveS3();
  if (s3) { /* existing S3 logic */ }
  // Strategy 2: SDK uploadFile
  if (accessToken) { /* existing SDK logic */ }
  // Strategy 3: base64
  return { base64: buffer.toString('base64'), mediaType };
}
```

- [ ] **Step 3: 添加 MEDIA_TYPE_MAP**

```typescript
const MEDIA_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};
```

- [ ] **Step 4: 添加 import**

```typescript
import { resolveBoardDirFromDb } from "@openloaf/api/common/boardPaths";
import { promises as fs } from "node:fs";
```

- [ ] **Step 5: 类型检查**

Run: `pnpm -w exec tsc -p apps/server/tsconfig.json --noEmit`

- [ ] **Step 6: Commit**

```
feat(media): support path-based input in v3 generate endpoint
```

---

### Task 2: 前端 — MediaSlot 上传改为保存到画布 asset 目录

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/shared/MediaSlot.tsx`

**核心逻辑:** 用户选择文件后，调用 `saveBoardAssetFile` 保存到画布 asset 目录，返回 board-relative path（如 `asset/xxx.jpg`），而非 `FileReader.readAsDataURL`。

- [ ] **Step 1: 添加 boardId + projectId props**

```typescript
export type MediaSlotProps = {
  // ...existing...
  /** Board id for saving uploaded files. */
  boardId?: string
  /** Project id for file resolution. */
  projectId?: string
  /** Board folder URI for asset storage. */
  boardFolderUri?: string
  /** Called when user uploads a file (returns board-relative path). */
  onUpload?: (path: string) => void
}
```

- [ ] **Step 2: 修改 handleFileChange**

用 `saveBoardAssetFile` 保存文件到画布 asset 目录，返回 board-relative path：

```typescript
const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file || !boardFolderUri) return
  try {
    const result = await saveBoardAssetFile(file, boardFolderUri)
    if (result?.relativePath) onUpload?.(result.relativePath)
  } catch {
    // fallback: 保存失败时用 data URL
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onUpload?.(reader.result)
    }
    reader.readAsDataURL(file)
  }
  e.target.value = ''
}
```

- [ ] **Step 3: 预览显示**

path 不是 data URL 时，需要通过 `getBoardPreviewEndpoint` 转为可显示的 URL：

```typescript
const displaySrc = useMemo(() => {
  if (!src) return undefined
  if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('blob:')) return src
  // board-relative path → preview URL
  if (boardId) return getBoardPreviewEndpoint(src, { boardId, projectId })
  return src
}, [src, boardId, projectId])
```

用 `displaySrc` 替换模板中的 `src` 用于 `<img>` 显示。

- [ ] **Step 4: 类型检查**

Run: `pnpm exec tsc -p apps/web/tsconfig.json --noEmit`

- [ ] **Step 5: Commit**

```
feat(board): MediaSlot saves to board asset dir instead of data URL
```

---

### Task 3: 前端 — Variant 组件传 path 代替 URL

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/image/ImgGenQwenVariant.tsx`
- Modify: 其他 variant 组件（ImgGenVolcVariant、OutpaintQwenVariant 等）
- Modify: `apps/web/src/components/board/nodes/ImageNode.tsx` (upstream 传递)
- Modify: `apps/web/src/components/board/nodes/VideoNode.tsx` (upstream 传递)

**核心逻辑:**

1. `ImageNode.tsx` 中传给面板的 upstream images 改为原始 board-relative path（`upstream.imageList`），而非 resolved URL
2. variant 组件的 `images` 参数改为 `{ path: "asset/xxx.jpg" }` 格式
3. 手动上传的也用 `{ path: "asset/xxx.jpg" }`（来自 Task 2 的 MediaSlot）
4. 保留 `{ url: "data:..." }` 作为 fallback（非画布场景）

- [ ] **Step 1: ImageNode — 传原始 path 给面板**

```typescript
// 改前：
const resolvedUpstreamImages = useMemo(
  () => upstream?.imageList.map(src => resolveImageSource(src, fileContext)).filter(Boolean) ?? [],
  [upstream?.imageList, fileContext],
);

// 改后：直接传原始 board-relative path
const upstreamImagePaths = upstream?.imageList ?? [];
```

面板 props 中 `upstream.images` 从 resolved URL 改为原始 path。

- [ ] **Step 2: Variant 组件 — 构建 path-based input**

```typescript
// ImgGenQwenVariant.tsx
// 改前：
{ images: allImages.map(url => ({ url })) }

// 改后：区分 path 和 data URL
{ images: allImages.map(src =>
    src.startsWith('data:') || src.startsWith('http')
      ? { url: src }
      : { path: src }  // board-relative path
  )
}
```

- [ ] **Step 3: 所有 variant 组件同步修改**

检查并修改所有使用 `{ url: ... }` 的 variant：
- `ImgGenQwenVariant.tsx`
- `ImgGenVolcVariant.tsx`
- `OutpaintQwenVariant.tsx`
- `UpscaleQwenVariant.tsx`
- `UpscaleVolcVariant.tsx`
- video 相关 variant

- [ ] **Step 4: MediaSlot 的 src 预览适配**

variant 组件把 board-relative path 传给 MediaSlot 时，需传 `boardId` / `projectId` 让 MediaSlot 生成预览 URL。

- [ ] **Step 5: 类型检查**

Run: `pnpm exec tsc -p apps/web/tsconfig.json --noEmit`

- [ ] **Step 6: Commit**

```
feat(board): variant components send path instead of URL for v3 generate
```

---

### Task 4: 清理 — 移除 localhost self-fetch 逻辑

**Files:**
- Modify: `apps/server/src/modules/saas/modules/media/mediaProxy.ts`

- [ ] **Step 1: 在 `resolveLocalMediaInput` 中 localhost URL 分支添加 deprecation 日志**

暂不移除旧逻辑（向后兼容），但加 warn 日志提示应改用 path：

```typescript
if (url && isLocalMediaUrl(url)) {
  logger.warn({ url }, 'Deprecated: localhost URL input, use path-based input instead');
  // ...existing fallback logic...
}
```

- [ ] **Step 2: Commit**

```
chore(media): add deprecation warning for localhost URL media input
```
