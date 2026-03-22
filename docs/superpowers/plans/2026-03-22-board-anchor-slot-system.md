# Board 锚点方向化 + 声明式插槽 + 节点重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一画布节点的锚点方向语义（左=输入/右=输出）、声明式输入插槽系统（含文本 @ 引用）、动态分组式 NodePicker、连接校验，同时消除 Image/Video/AudioNode 的 ~1200 行重复代码。

**Architecture:** 分 5 个 Phase 递进实施（线性依赖链：1→2→3→4→5）。Phase 1 提取共享 MediaNode 基础设施（纯重构，不改功能）；Phase 2 构建声明式 InputSlot 系统含文本引用；Phase 3 为锚点添加 input/output 方向语义；Phase 4 替换 NodePicker 为动态分组菜单；Phase 5 实现连接校验与视觉反馈。Phase 1 内部各 Task 可独立 land。

**关键约定:**
- `BoardFileContext` 类型来自 `../../board-contracts` (不是 boardContext)
- `arrayBufferToBase64` 来自 `../../utils/base64` (不是 @/utils/encoding)
- `resolveProjectPathFromBoardUri` 接受单个对象参数 `{ uri, boardFolderScope, ... }`
- `engine.viewport.getState()` 获取视口状态 (不是 engine.getView())
- `InputSnapshot.upstreamRefs` 是 `Array<{ nodeId, nodeType, data }>` 数组，不是扁平对象
- 新增的 `acceptsInputTypes`、`producesOutputType`、`inputSlots` 在 `VariantDefinition` 上为 **可选字段**，未声明时回退到旧行为
- 既有 `MediaSlot` 组件保留不变，新建 `MediaSlotGroup` 是对它的组合封装

**Tech Stack:** React 19, TypeScript, Zustand, contentEditable (chip rendering), Zod, i18next, lucide-react

---

## 文件结构总览

### 新建文件

```
apps/web/src/components/board/
├── nodes/shared/
│   ├── useFileUploadHandler.ts        # Phase 1 — 统一文件上传事件处理
│   ├── useInlinePanelSync.ts          # Phase 1 — 面板缩放同步
│   ├── useMediaGeneration.ts          # Phase 1 — 生成/重试/新节点统一流程
│   ├── useEffectiveUpstream.ts        # Phase 1 — 冻结上游数据计算
│   ├── resolveMediaSource.ts          # Phase 1 — 路径解析统一
│   ├── downloadMediaFile.ts           # Phase 1 — 文件下载统一
│   ├── FailureOverlay.tsx             # Phase 1 — 失败浮层组件
│   └── InlinePanelPortal.tsx          # Phase 1 — AI 面板 Portal 容器
│
├── panels/variants/
│   ├── slot-types.ts                  # Phase 2 — InputSlotDefinition 等类型
│   ├── slot-engine.ts                 # Phase 2 — assignUpstreamToSlots 分配引擎
│   ├── shared/
│   │   ├── InputSlotBar.tsx           # Phase 2 — 统一插槽渲染入口
│   │   ├── TextSlotField.tsx          # Phase 2 — 文本插槽（支持 @ 引用 chip）
│   │   ├── TextReferencePool.tsx      # Phase 2 — 待分配文本引用池
│   │   ├── ReferenceChip.tsx          # Phase 2 — 文本引用 chip 组件
│   │   ├── ReferenceDropdown.tsx      # Phase 2 — @ 菜单下拉
│   │   ├── MediaSlotGroup.tsx         # Phase 2 — 图片/视频/音频插槽组
│   │   └── OverflowHint.tsx           # Phase 2 — 溢出提示条
│   │
│   └── slot-declarations.ts           # Phase 2 — 所有 variant 的插槽声明注册
│
├── engine/
│   ├── anchor-direction.ts            # Phase 3 — 锚点方向语义
│   └── connection-validator.ts        # Phase 5 — 连接校验逻辑
│
└── core/
    └── GroupedNodePicker.tsx           # Phase 4 — 分组式节点选择菜单
```

### 修改文件

```
apps/web/src/components/board/
├── engine/
│   ├── types.ts                       # Phase 2+3 — 新增 outputTypes, inputSlots 等字段
│   ├── anchorTypes.ts                 # Phase 3 — 新增方向常量
│   ├── anchors.ts                     # Phase 3 — 锚点方向标记
│   ├── hit-testing.ts                 # Phase 3+5 — 方向校验
│   └── upstream-data.ts              # Phase 2 — textList 保留 entries 身份信息
│
├── nodes/
│   ├── ImageNode.tsx                  # Phase 1 — 瘦身 ~900 行 → ~500 行
│   ├── VideoNode.tsx                  # Phase 1 — 瘦身 ~850 行 → ~500 行
│   └── AudioNode.tsx                  # Phase 1 — 瘦身 ~550 行 → ~300 行
│
├── panels/
│   ├── variants/types.ts             # Phase 2 — VariantDefinition 新增插槽声明
│   ├── variants/image/index.ts       # Phase 2 — 注册 inputSlots + outputType
│   ├── variants/video/index.ts       # Phase 2 — 同上
│   ├── variants/audio/index.ts       # Phase 2 — 同上
│   ├── ImageAiPanel.tsx              # Phase 2 — 使用 InputSlotBar 替代手动渲染
│   ├── VideoAiPanel.tsx              # Phase 2 — 同上
│   └── AudioAiPanel.tsx              # Phase 2 — 同上
│
├── core/
│   ├── AnchorOverlay.tsx             # Phase 3 — 方向视觉提示
│   ├── BoardCanvasInteraction.tsx    # Phase 3+4 — 方向化拖拽 + GroupedNodePicker
│   └── NodePicker.tsx                # Phase 4 — 标记 deprecated, 由 GroupedNodePicker 替代
│
├── tools/
│   └── SelectTool.ts                 # Phase 3+5 — 方向校验 + 拖拽限制
│
└── i18n/locales/
    ├── zh-CN/board.json              # Phase 2+4 — 新增翻译 key
    ├── en-US/board.json
    ├── ja-JP/board.json
    └── zh-TW/board.json
```

---

## Phase 1: 共享 MediaNode 基础设施

> 目标：从 ImageNode/VideoNode/AudioNode 提取 6 个共享 hook + 2 个共享组件，消除 ~1200 行重复代码。不改变任何功能行为。

### Task 1.1: useFileUploadHandler hook

**Files:**
- Create: `apps/web/src/components/board/nodes/shared/useFileUploadHandler.ts`
- Modify: `apps/web/src/components/board/nodes/ImageNode.tsx`
- Modify: `apps/web/src/components/board/nodes/VideoNode.tsx`
- Modify: `apps/web/src/components/board/nodes/AudioNode.tsx`

- [ ] **Step 1: 创建 useFileUploadHandler hook**

```typescript
// apps/web/src/components/board/nodes/shared/useFileUploadHandler.ts
import { useCallback, useEffect, useRef } from 'react'
import { saveBoardAssetFile } from '../../utils/board-asset'
import type { BoardFileContext } from '../../board-contracts'

/**
 * Unified file upload handler for media nodes.
 * Handles:
 * 1. Hidden <input type="file"> ref management
 * 2. File save to board assets (or custom save logic via saveFn)
 * 3. 'board:trigger-upload' custom event listener
 */
export function useFileUploadHandler(
  elementId: string,
  fileContext: BoardFileContext | undefined,
  onUpdate: (patch: Record<string, unknown>) => void,
  options?: {
    /** Custom save function. If provided, replaces default saveBoardAssetFile.
     *  Use this for ImageNode which needs buildImageNodePayloadFromUri. */
    saveFn?: (file: File, ctx: BoardFileContext) => Promise<Record<string, unknown>>
    /** Prop name for the saved path. Default: 'sourcePath'. Ignored if saveFn is used. */
    pathProp?: string
    /** Prop name for the file name. Default: 'fileName'. Ignored if saveFn is used. */
    nameProp?: string
  },
) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pathProp = options?.pathProp ?? 'sourcePath'
  const nameProp = options?.nameProp ?? 'fileName'

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !fileContext) return
      e.target.value = ''

      if (options?.saveFn) {
        // Custom save (e.g., ImageNode uses buildImageNodePayloadFromUri)
        const patch = await options.saveFn(file, fileContext)
        onUpdate(patch)
      } else {
        // Default: save to board assets
        const saved = await saveBoardAssetFile(file, fileContext)
        onUpdate({ [pathProp]: saved.path, [nameProp]: saved.name })
      }
    },
    [fileContext, onUpdate, pathProp, nameProp, options?.saveFn],
  )

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === elementId) {
        fileInputRef.current?.click()
      }
    }
    document.addEventListener('board:trigger-upload', handler)
    return () => document.removeEventListener('board:trigger-upload', handler)
  }, [elementId])

  return { fileInputRef, handleFileInputChange }
}
```

- [ ] **Step 2: 在 ImageNode 中替换重复代码**

在 `ImageNode.tsx` 中：
- 删除 `handleReplaceInputChange` 中的文件处理逻辑（约 20 行）
- 删除 `board:trigger-upload` 事件监听（约 10 行）
- 替换为：
  ```typescript
  const { fileInputRef, handleFileInputChange } = useFileUploadHandler(
    element.id, fileContext, onUpdate,
    { saveFn: async (file, ctx) => {
        // ImageNode 特殊处理：使用 buildImageNodePayloadFromUri
        const payload = await buildImageNodePayloadFromUri(file, ctx)
        return payload  // 返回完整 patch
      }
    },
  )
  ```

- [ ] **Step 3: 在 VideoNode 和 AudioNode 中替换**

相同模式替换，这两个节点的文件上传更简单（直接 `saveBoardAssetFile`）。

- [ ] **Step 4: 验证三个节点的上传功能正常**

手动测试：在画布中对 Image/Video/Audio 节点执行上传操作，确认行为不变。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/nodes/shared/useFileUploadHandler.ts \
       apps/web/src/components/board/nodes/ImageNode.tsx \
       apps/web/src/components/board/nodes/VideoNode.tsx \
       apps/web/src/components/board/nodes/AudioNode.tsx
git commit -m "refactor(board): extract useFileUploadHandler from media nodes"
```

---

### Task 1.2: useInlinePanelSync hook

**Files:**
- Create: `apps/web/src/components/board/nodes/shared/useInlinePanelSync.ts`
- Modify: `apps/web/src/components/board/nodes/ImageNode.tsx`
- Modify: `apps/web/src/components/board/nodes/VideoNode.tsx`
- Modify: `apps/web/src/components/board/nodes/AudioNode.tsx`

- [ ] **Step 1: 创建 useInlinePanelSync hook**

```typescript
// apps/web/src/components/board/nodes/shared/useInlinePanelSync.ts
import { useEffect, type RefObject } from 'react'
import type { CanvasEngine } from '../../engine/CanvasEngine'

const PANEL_GAP_PX = 8

/**
 * Syncs the inline AI panel position/scale with canvas viewport changes.
 * Uses direct DOM manipulation to avoid React render delays.
 */
export function useInlinePanelSync(
  engine: CanvasEngine,
  xywhRef: RefObject<[number, number, number, number]>,
  panelRef: RefObject<HTMLDivElement | null>,
  expanded: boolean,
) {
  useEffect(() => {
    if (!expanded) return
    const syncPanelScale = () => {
      const panel = panelRef.current
      if (!panel) return
      const { zoom } = engine.viewport.getState()  // 注意：不是 engine.getView()
      const [nx, ny, nw, nh] = xywhRef.current!
      panel.style.transform = `translateX(-50%) scale(${1 / zoom})`
      panel.style.transformOrigin = 'top center'
      panel.style.left = `${nx + nw / 2}px`
      panel.style.top = `${ny + nh + PANEL_GAP_PX / zoom}px`
    }
    syncPanelScale()
    return engine.subscribeView(syncPanelScale)
  }, [engine, expanded, panelRef, xywhRef])
}

export { PANEL_GAP_PX }
```

- [ ] **Step 2: 替换三个节点中的面板同步代码**

每个节点删除约 15 行重复的 `useEffect + subscribeView` 代码，替换为单行 hook 调用。

- [ ] **Step 3: 验证面板缩放和定位正常**

在画布中选中各媒体节点，缩放画布，确认 AI 面板始终保持正确位置和大小。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/nodes/shared/useInlinePanelSync.ts \
       apps/web/src/components/board/nodes/ImageNode.tsx \
       apps/web/src/components/board/nodes/VideoNode.tsx \
       apps/web/src/components/board/nodes/AudioNode.tsx
git commit -m "refactor(board): extract useInlinePanelSync from media nodes"
```

---

### Task 1.3: resolveMediaSource + downloadMediaFile 工具函数

**Files:**
- Create: `apps/web/src/components/board/nodes/shared/resolveMediaSource.ts`
- Create: `apps/web/src/components/board/nodes/shared/downloadMediaFile.ts`
- Modify: `apps/web/src/components/board/nodes/ImageNode.tsx`
- Modify: `apps/web/src/components/board/nodes/VideoNode.tsx`
- Modify: `apps/web/src/components/board/nodes/AudioNode.tsx`

- [ ] **Step 1: 创建 resolveMediaSource**

```typescript
// apps/web/src/components/board/nodes/shared/resolveMediaSource.ts
import { isBoardRelativePath, resolveBoardFolderScope, resolveProjectPathFromBoardUri } from '../../core/boardFilePath'
import { getBoardPreviewEndpoint, getPreviewEndpoint } from '../../utils/preview-endpoint'
import type { BoardFileContext } from '../../board-contracts'

/** Resolve a board-relative or project path to a browser-friendly URL. */
export function resolveMediaSource(
  src: string | undefined,
  fileContext: BoardFileContext | undefined,
): string | undefined {
  if (!src) return undefined
  if (/^(data:|blob:|https?:)/.test(src)) return src
  if (!fileContext) return undefined
  const scope = resolveBoardFolderScope(fileContext)
  if (!scope) return undefined
  if (isBoardRelativePath(src)) {
    return getBoardPreviewEndpoint(src, scope.boardId, scope.projectId)
  }
  // 注意：resolveProjectPathFromBoardUri 接受单个对象参数
  const projectPath = resolveProjectPathFromBoardUri({
    uri: src,
    boardFolderScope: scope,
  })
  return projectPath ? getPreviewEndpoint(projectPath, scope.projectId) : undefined
}

/** Convert a board-scoped src to a project-relative path string. */
export function resolveProjectRelativePath(
  src: string,
  fileContext: BoardFileContext,
): string | undefined {
  const scope = resolveBoardFolderScope(fileContext)
  if (!scope) return undefined
  return resolveProjectPathFromBoardUri({ uri: src, boardFolderScope: scope })
}
```

- [ ] **Step 2: 创建 downloadMediaFile**

```typescript
// apps/web/src/components/board/nodes/shared/downloadMediaFile.ts
import { arrayBufferToBase64 } from '../../utils/base64'
import type { BoardFileContext } from '../../board-contracts'
import { resolveMediaSource } from './resolveMediaSource'

/**
 * Download a media file via Electron native dialog or browser fallback.
 */
export async function downloadMediaFile(
  src: string,
  fileName: string,
  fileContext: BoardFileContext | undefined,
): Promise<void> {
  const href = resolveMediaSource(src, fileContext)
  if (!href) return

  if (window.openloafElectron?.saveFile) {
    const resp = await fetch(href)
    const buf = await resp.arrayBuffer()
    const base64 = arrayBufferToBase64(buf)
    const defaultDir = fileContext?.rootUri?.replace('file://', '') ?? undefined
    await window.openloafElectron.saveFile(base64, fileName, defaultDir)
  } else {
    const a = document.createElement('a')
    a.href = href
    a.download = fileName
    a.click()
  }
}
```

- [ ] **Step 3: 替换三个节点中的路径解析和下载函数**

每个节点删除约 50-80 行重复的 `resolveProjectRelativePath`、`resolveImageSource`、`downloadXxxFile` 函数。

- [ ] **Step 4: 验证下载和预览功能正常**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/nodes/shared/resolveMediaSource.ts \
       apps/web/src/components/board/nodes/shared/downloadMediaFile.ts \
       apps/web/src/components/board/nodes/ImageNode.tsx \
       apps/web/src/components/board/nodes/VideoNode.tsx \
       apps/web/src/components/board/nodes/AudioNode.tsx
git commit -m "refactor(board): extract resolveMediaSource and downloadMediaFile"
```

---

### Task 1.4: useEffectiveUpstream hook

**Files:**
- Create: `apps/web/src/components/board/nodes/shared/useEffectiveUpstream.ts`
- Modify: `apps/web/src/components/board/nodes/ImageNode.tsx`
- Modify: `apps/web/src/components/board/nodes/VideoNode.tsx`
- Modify: `apps/web/src/components/board/nodes/AudioNode.tsx`

- [ ] **Step 1: 创建 useEffectiveUpstream hook**

```typescript
// apps/web/src/components/board/nodes/shared/useEffectiveUpstream.ts
import { useMemo } from 'react'
import type { UpstreamData } from '../../engine/upstream-data'
import type { VersionStackEntry } from '../../engine/version-stack'
import type { BoardFileContext } from '../../board-contracts'
import { resolveMediaSource } from './resolveMediaSource'

export interface EffectiveUpstream {
  text?: string
  images?: string[]
  imagePaths?: string[]
  audioUrl?: string
  videoUrl?: string
}

/**
 * Computes effective upstream data:
 * - If a ready primary version exists with frozen upstream refs, use those.
 * - Otherwise, use live upstream data.
 *
 * 注意：upstreamRefs 是 Array<{ nodeId, nodeType, data }> 格式，
 * 需要按 nodeType 过滤提取各类型数据。
 */
export function useEffectiveUpstream(
  primaryEntry: VersionStackEntry | undefined,
  upstream: UpstreamData | undefined,
  fileContext: BoardFileContext | undefined,
): EffectiveUpstream {
  return useMemo(() => {
    // Frozen upstream from version snapshot
    if (primaryEntry?.status === 'ready' && primaryEntry.input?.upstreamRefs) {
      const refs = primaryEntry.input.upstreamRefs as Array<{
        nodeId: string; nodeType: string; data: string
      }>
      // upstreamRefs 是数组，需按 nodeType 过滤
      const textEntries = refs.filter(r => r.nodeType === 'text')
      const imageEntries = refs.filter(r => r.nodeType === 'image')
      const audioEntries = refs.filter(r => r.nodeType === 'audio')
      const videoEntries = refs.filter(r => r.nodeType === 'video')

      return {
        text: textEntries.map(r => r.data).join('\n') || undefined,
        images: imageEntries
          .map(r => resolveMediaSource(r.data, fileContext))
          .filter(Boolean) as string[],
        imagePaths: imageEntries.map(r => r.data),
        audioUrl: audioEntries[0]?.data,
        videoUrl: videoEntries[0]?.data,
      }
    }
    // Live upstream
    return {
      text: upstream?.textList.join('\n') || undefined,
      images: upstream?.imageList
        .map(src => resolveMediaSource(src, fileContext))
        .filter(Boolean) as string[],
      imagePaths: upstream?.imageList,
      audioUrl: upstream?.audioList[0],
      videoUrl: upstream?.videoList[0],
    }
  }, [primaryEntry, upstream, fileContext])
}
```

- [ ] **Step 2: 替换三个节点中的 effectiveUpstream 计算**

每个节点删除约 25 行重复的 `useMemo` 计算。

- [ ] **Step 3: 验证版本切换和上游数据冻结正常**

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/nodes/shared/useEffectiveUpstream.ts \
       apps/web/src/components/board/nodes/ImageNode.tsx \
       apps/web/src/components/board/nodes/VideoNode.tsx \
       apps/web/src/components/board/nodes/AudioNode.tsx
git commit -m "refactor(board): extract useEffectiveUpstream from media nodes"
```

---

### Task 1.5: FailureOverlay + InlinePanelPortal 共享组件

**Files:**
- Create: `apps/web/src/components/board/nodes/shared/FailureOverlay.tsx`
- Create: `apps/web/src/components/board/nodes/shared/InlinePanelPortal.tsx`
- Modify: `apps/web/src/components/board/nodes/ImageNode.tsx`
- Modify: `apps/web/src/components/board/nodes/VideoNode.tsx`
- Modify: `apps/web/src/components/board/nodes/AudioNode.tsx`

- [ ] **Step 1: 创建 FailureOverlay**

```typescript
// apps/web/src/components/board/nodes/shared/FailureOverlay.tsx
'use client'
import { RefreshCw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface FailureOverlayProps {
  message: string
  canDismiss: boolean
  onRetry: () => void
  onDismiss?: () => void
  onNewNode?: () => void
}

export function FailureOverlay({
  message,
  canDismiss,
  onRetry,
  onDismiss,
  onNewNode,
}: FailureOverlayProps) {
  const { t } = useTranslation('board')
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-3xl bg-black/60 p-4">
      <X size={20} className="text-white/60" />
      <p className="text-center text-xs text-white/80">{message}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs text-white hover:bg-white/30"
          onPointerDown={(e) => { e.stopPropagation(); onRetry() }}
        >
          <RefreshCw size={12} />
          {t('generate.retry')}
        </button>
        {onNewNode && (
          <button
            type="button"
            className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs text-white hover:bg-white/30"
            onPointerDown={(e) => { e.stopPropagation(); onNewNode() }}
          >
            {t('generate.retryNewNode')}
          </button>
        )}
      </div>
      {canDismiss && onDismiss && (
        <button
          type="button"
          className="text-[10px] text-white/50 hover:text-white/70"
          onPointerDown={(e) => { e.stopPropagation(); onDismiss() }}
        >
          {t('generate.dismiss')}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建 InlinePanelPortal**

```typescript
// apps/web/src/components/board/nodes/shared/InlinePanelPortal.tsx
'use client'
import { createPortal } from 'react-dom'
import { forwardRef, type ReactNode } from 'react'

interface InlinePanelPortalProps {
  target: HTMLElement | null
  expanded: boolean
  children: ReactNode
}

export const InlinePanelPortal = forwardRef<HTMLDivElement, InlinePanelPortalProps>(
  function InlinePanelPortal({ target, expanded, children }, ref) {
    if (!expanded || !target) return null
    return createPortal(
      <div
        ref={ref}
        className="absolute z-20"
        style={{ pointerEvents: 'auto' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>,
      target,
    )
  },
)
```

- [ ] **Step 3: 替换三个节点中的失败浮层和面板 Portal**

每个节点删除约 40-60 行重复的 JSX。

- [ ] **Step 4: 验证失败浮层和 AI 面板显示正常**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/nodes/shared/FailureOverlay.tsx \
       apps/web/src/components/board/nodes/shared/InlinePanelPortal.tsx \
       apps/web/src/components/board/nodes/ImageNode.tsx \
       apps/web/src/components/board/nodes/VideoNode.tsx \
       apps/web/src/components/board/nodes/AudioNode.tsx
git commit -m "refactor(board): extract FailureOverlay and InlinePanelPortal"
```

---

### Task 1.6: useMediaGeneration hook

**Files:**
- Create: `apps/web/src/components/board/nodes/shared/useMediaGeneration.ts`
- Modify: `apps/web/src/components/board/nodes/ImageNode.tsx`
- Modify: `apps/web/src/components/board/nodes/VideoNode.tsx`
- Modify: `apps/web/src/components/board/nodes/AudioNode.tsx`

- [ ] **Step 1: 创建 useMediaGeneration hook**

这个 hook 封装生成/重试/新节点三个核心流程的共同模板：

```typescript
// apps/web/src/components/board/nodes/shared/useMediaGeneration.ts
import { useCallback, useRef } from 'react'
import {
  createInputSnapshot,
  createGeneratingEntry,
  pushVersion,
  removeFailedEntry,
} from '../../engine/version-stack'
import { resolveAllMediaInputs } from '@/lib/media-upload'
import { mapErrorToMessageKey } from '../../hooks/useVersionStack'
import { deriveNode } from '../../utils/derive-node'
import type { CanvasEngine } from '../../engine/CanvasEngine'
import type { CanvasNodeElement } from '../../engine/types'
import type { BoardFileContext } from '../../board-contracts'
import type { EffectiveUpstream } from './useEffectiveUpstream'

interface MediaGenerationConfig {
  /** The submit function (submitImageGenerate / submitVideoGenerate / submitAudioGenerate) */
  submitFn: (params: any) => Promise<{ taskId: string }>
  /** Derive node target type */
  deriveNodeType: string
  /** Derive node default size */
  deriveNodeSize: [number, number]
  /** The engine instance */
  engine: CanvasEngine
  /** The current element */
  element: CanvasNodeElement<any>
  /** File context */
  fileContext: BoardFileContext | undefined
  /** onUpdate callback */
  onUpdate: (patch: Record<string, unknown>) => void
  /** Effective upstream data */
  effectiveUpstream: EffectiveUpstream
  /** Failure state setter */
  setLastFailure: (failure: { message: string; input?: any } | null) => void
}

export function useMediaGeneration(config: MediaGenerationConfig) {
  const configRef = useRef(config)
  configRef.current = config

  const handleGenerate = useCallback(
    async (generateParams: {
      feature: string
      variant: string
      inputs: Record<string, unknown>
      params: Record<string, unknown>
      count?: number
      seed?: number
    }) => {
      const { element, onUpdate, effectiveUpstream, submitFn, setLastFailure } = configRef.current
      const stack = element.props.versionStack

      // 1. Create input snapshot
      const snapshot = createInputSnapshot(
        generateParams.inputs.prompt as string | undefined,
        generateParams.params,
        {
          text: effectiveUpstream.text,
          images: effectiveUpstream.imagePaths,
          audioUrl: effectiveUpstream.audioUrl,
          videoUrl: effectiveUpstream.videoUrl,
        },
      )

      // 2. Create pending entry (no taskId yet)
      const pendingEntry = createGeneratingEntry()

      // 3. Immediately write to version stack
      onUpdate({
        versionStack: pushVersion(stack, { ...pendingEntry, input: snapshot }),
        origin: 'ai-generate',
      })

      try {
        // 4. Submit to API
        const result = await submitFn(generateParams)

        // 5. Backfill taskId
        onUpdate({
          versionStack: {
            ...pushVersion(stack, { ...pendingEntry, input: snapshot }),
            entries: (element.props.versionStack?.entries ?? []).map((e: any) =>
              e.id === pendingEntry.id ? { ...e, taskId: result.taskId } : e,
            ),
          },
        })
      } catch (err: any) {
        // 6. Remove failed entry + show error
        onUpdate({
          versionStack: removeFailedEntry(
            pushVersion(stack, { ...pendingEntry, input: snapshot }),
            pendingEntry.id,
          ),
        })
        setLastFailure({
          message: mapErrorToMessageKey(err),
          input: snapshot,
        })
      }
    },
    [],
  )

  const handleRetry = useCallback(
    (failedInput: any) => {
      if (!failedInput) return
      // Reconstruct params from snapshot and re-submit
      handleGenerate(failedInput)
    },
    [handleGenerate],
  )

  return { handleGenerate, handleRetry }
}
```

> **注意：** 这是简化版。实际实现需要处理 ImageNode 的 `buildImageNodePayloadFromUri`、VideoNode 的 `fetchVideoMetadata`、AudioNode 无元数据获取等差异。通过 `config.onSuccess` 回调让每个节点提供特定的成功处理逻辑。

- [ ] **Step 2: 在三个节点中替换生成逻辑**

这是最复杂的替换，因为三个节点的 `handleGenerate` / `handleRetry` / `handleGenerateNewNode` 有细微差异（主要在成功后的元数据获取和节点尺寸调整）。需要通过 `onSuccess` 回调参数化这些差异。

- [ ] **Step 3: 逐一测试三个节点的生成、重试、派生新节点功能**

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/nodes/shared/useMediaGeneration.ts \
       apps/web/src/components/board/nodes/ImageNode.tsx \
       apps/web/src/components/board/nodes/VideoNode.tsx \
       apps/web/src/components/board/nodes/AudioNode.tsx
git commit -m "refactor(board): extract useMediaGeneration from media nodes"
```

---

## Phase 2: 声明式 InputSlot 系统

> 目标：每个 variant 声明自己的输入插槽，上游数据自动分配到插槽，溢出有 UI 提示，文本支持 @ 引用 chip。

### Task 2.1: 类型定义 + 分配引擎

**Files:**
- Create: `apps/web/src/components/board/panels/variants/slot-types.ts`
- Create: `apps/web/src/components/board/panels/variants/slot-engine.ts`
- Modify: `apps/web/src/components/board/engine/upstream-data.ts`

- [ ] **Step 1: 创建 slot-types.ts**

```typescript
// apps/web/src/components/board/panels/variants/slot-types.ts

export type MediaType = 'image' | 'video' | 'audio' | 'text'
export type OverflowStrategy = 'rotate' | 'merge' | 'truncate'
export type TextReferenceMode = 'inline' | 'replace'

/** 声明式输入插槽定义 */
export interface InputSlotDefinition {
  /** 插槽唯一标识 (如 'prompt', 'image', 'startFrame', 'audio') */
  id: string
  /** 接受的媒体类型 */
  mediaType: MediaType
  /** 显示标签 (i18n key) */
  labelKey: string
  /** 最少需要 */
  min: number
  /** 最多接受 */
  max: number
  /** 是否允许手动上传/输入 */
  allowManualInput: boolean
  /** 当同类型多输入 > max 时的溢出策略 */
  overflowStrategy: OverflowStrategy
  /** 文本插槽专属：引用模式 */
  referenceMode?: TextReferenceMode
}

/** 上游文本引用（保留身份信息） */
export interface TextReference {
  nodeId: string
  label: string
  content: string
  charCount: number
}

/** 上游媒体引用（保留身份信息） */
export interface MediaReference {
  nodeId: string
  nodeType: string
  url: string        // 浏览器友好 URL（显示用）
  path?: string      // 原始路径（API 提交用）
}

/** 分配结果 */
export interface SlotAssignment {
  /** slotId → 已分配的引用 */
  assigned: Record<string, (TextReference | MediaReference)[]>
  /** mediaType → 溢出的引用 */
  overflow: Record<string, (TextReference | MediaReference)[]>
  /** 缺失的必需插槽 */
  missingRequired: string[]
}
```

- [ ] **Step 2: 修改 upstream-data.ts 保留文本身份信息**

当前 `textList` 只有内容字符串。需要让 `entries` 中的文本条目可被引用系统消费：

```typescript
// upstream-data.ts — UpstreamEntry 已有 { nodeId, nodeType, data }
// 不需要改类型，但需要确保 textList 和 entries 的索引对应关系
// 在 resolveUpstreamData 中，为 text 类型的 entry 额外保存节点 label

export type UpstreamEntry = {
  nodeId: string
  nodeType: string
  data: string
  label?: string  // 新增：节点标题/显示名
}
```

在收集 text 条目时，从 TextNode 的 props 中提取标题：

```typescript
// upstream-data.ts 约第 196-202 行
if (node.type === 'text') {
  const text = serializeTextNodeValue(props.value)
  if (text) {
    textList.push(text)
    entries.push({
      nodeId: node.id,
      nodeType: 'text',
      data: text,
      label: props.title || `Text ${node.id.slice(0, 4)}`,  // 新增
    })
  }
}
```

- [ ] **Step 3: 创建 slot-engine.ts**

```typescript
// apps/web/src/components/board/panels/variants/slot-engine.ts
import type {
  InputSlotDefinition,
  TextReference,
  MediaReference,
  SlotAssignment,
  MediaType,
} from './slot-types'
import type { UpstreamData, UpstreamEntry } from '../../engine/upstream-data'
import type { BoardFileContext } from '../../board-contracts'
import { resolveMediaSource } from '../../nodes/shared/resolveMediaSource'

/** Convert UpstreamData entries to typed references. */
export function buildReferencePools(
  upstream: UpstreamData,
  fileContext: BoardFileContext | undefined,
  nodeResource?: { type: MediaType; url?: string; path?: string },
): Record<MediaType, (TextReference | MediaReference)[]> {
  const pools: Record<MediaType, (TextReference | MediaReference)[]> = {
    text: [],
    image: [],
    video: [],
    audio: [],
  }

  // Node resource has highest priority
  if (nodeResource?.path || nodeResource?.url) {
    pools[nodeResource.type].unshift({
      nodeId: '__self__',
      nodeType: nodeResource.type,
      url: nodeResource.url ?? '',
      path: nodeResource.path,
    } as MediaReference)
  }

  for (const entry of upstream.entries) {
    if (entry.nodeType === 'text') {
      pools.text.push({
        nodeId: entry.nodeId,
        label: entry.label ?? `Text ${entry.nodeId.slice(0, 4)}`,
        content: entry.data,
        charCount: entry.data.length,
      } as TextReference)
    } else {
      const mediaType = entry.nodeType as MediaType
      if (pools[mediaType]) {
        pools[mediaType].push({
          nodeId: entry.nodeId,
          nodeType: entry.nodeType,
          url: resolveMediaSource(entry.data, fileContext) ?? entry.data,
          path: entry.data,
        } as MediaReference)
      }
    }
  }

  return pools
}

/** Assign upstream references to declared slots. */
export function assignUpstreamToSlots(
  slots: InputSlotDefinition[],
  pools: Record<MediaType, (TextReference | MediaReference)[]>,
): SlotAssignment {
  // Clone pools to avoid mutation
  const available: Record<MediaType, (TextReference | MediaReference)[]> = {
    text: [...pools.text],
    image: [...pools.image],
    video: [...pools.video],
    audio: [...pools.audio],
  }

  const assigned: Record<string, (TextReference | MediaReference)[]> = {}
  const missingRequired: string[] = []

  // Sort: required slots first (min > 0), then optional
  const sortedSlots = [...slots].sort((a, b) => b.min - a.min)

  for (const slot of sortedSlots) {
    const pool = available[slot.mediaType]

    if (slot.mediaType === 'text' && slot.overflowStrategy === 'merge' && pool.length > slot.max) {
      // Text merge: combine all into one synthetic reference
      const merged: TextReference = {
        nodeId: '__merged__',
        label: `${pool.length} texts merged`,
        content: (pool as TextReference[]).map(r => r.content).join('\n'),
        charCount: (pool as TextReference[]).reduce((sum, r) => sum + (r as TextReference).charCount, 0),
      }
      assigned[slot.id] = [merged]
      pool.length = 0 // drain pool
    } else {
      // Normal: take up to max from pool
      assigned[slot.id] = pool.splice(0, slot.max)
    }

    // Check required
    if (slot.min > 0 && assigned[slot.id].length < slot.min) {
      missingRequired.push(slot.id)
    }
  }

  // Remaining = overflow
  const overflow: Record<string, (TextReference | MediaReference)[]> = {}
  for (const [type, remaining] of Object.entries(available)) {
    if (remaining.length > 0) {
      overflow[type] = remaining
    }
  }

  return { assigned, overflow, missingRequired }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/panels/variants/slot-types.ts \
       apps/web/src/components/board/panels/variants/slot-engine.ts \
       apps/web/src/components/board/engine/upstream-data.ts
git commit -m "feat(board): add declarative InputSlot type system and assignment engine"
```

---

### Task 2.2: VariantDefinition 扩展 + 插槽声明注册

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/types.ts`
- Create: `apps/web/src/components/board/panels/variants/slot-declarations.ts`
- Modify: `apps/web/src/components/board/panels/variants/image/index.ts`
- Modify: `apps/web/src/components/board/panels/variants/video/index.ts`
- Modify: `apps/web/src/components/board/panels/variants/audio/index.ts`

- [ ] **Step 1: 扩展 VariantDefinition**

在 `types.ts` 第 44-57 行的 `VariantDefinition` 接口中新增字段：

```typescript
export interface VariantDefinition {
  component: ComponentType<VariantFormProps>
  isApplicable: (ctx: VariantContext) => boolean
  isDisabled?: (ctx: VariantContext) => boolean
  maskPaint?: boolean
  maskRequired?: boolean

  // ─── 新增 Phase 2（全部可选，渐进式迁移） ───
  /** 该 variant 接受的输入媒体类型（用于连接校验和 NodePicker） */
  acceptsInputTypes?: MediaType[]
  /** 运行该 variant 后的输出媒体类型 */
  producesOutputType?: MediaType
  /** 声明式输入插槽（用于 InputSlotBar 自动渲染）。
   *  未声明时回退到旧的手动 useSourceImage/useMediaSlots 行为。 */
  inputSlots?: InputSlotDefinition[]
}
```

> **迁移策略：** 新字段可选。`computeOutputTemplates` 和 `validateConnection` 只考虑有声明的 variant。未声明的 variant 继续使用旧的手动输入逻辑，面板中不渲染 InputSlotBar，直到被逐个迁移。

- [ ] **Step 2: 为所有现有 variant 添加插槽声明**

在各 `index.ts` 中逐个添加。示例：

```typescript
// variants/image/index.ts
'OL-IG-001': {
  component: ImgGenTextVariant,
  isApplicable: ctx => !ctx.hasImage,
  acceptsInputTypes: ['text'],
  producesOutputType: 'image',
  inputSlots: [
    { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt', min: 0, max: 1,
      allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
  ],
},

'OL-UP-001': {
  component: UpscaleQwenVariant,
  isApplicable: ctx => ctx.hasImage,
  acceptsInputTypes: ['image'],
  producesOutputType: 'image',
  inputSlots: [
    { id: 'image', mediaType: 'image', labelKey: 'slot.sourceImage', min: 1, max: 1,
      allowManualInput: true, overflowStrategy: 'rotate' },
  ],
},

'OL-IE-001': {
  component: ImgEditPlusVariant,
  isApplicable: ctx => ctx.hasImage,
  maskPaint: true,
  acceptsInputTypes: ['image'],
  producesOutputType: 'image',
  inputSlots: [
    { id: 'prompt', mediaType: 'text', labelKey: 'slot.editInstruction', min: 1, max: 1,
      allowManualInput: true, overflowStrategy: 'merge', referenceMode: 'inline' },
    { id: 'images', mediaType: 'image', labelKey: 'slot.referenceImages', min: 1, max: 3,
      allowManualInput: true, overflowStrategy: 'truncate' },
  ],
},

// ... 类似地为所有 variant 添加
```

完整映射表参见本文件末尾的附录 A。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/panels/variants/types.ts \
       apps/web/src/components/board/panels/variants/image/index.ts \
       apps/web/src/components/board/panels/variants/video/index.ts \
       apps/web/src/components/board/panels/variants/audio/index.ts
git commit -m "feat(board): add inputSlots and outputType declarations to all variants"
```

---

### Task 2.3: ReferenceChip + TextReferencePool + ReferenceDropdown 组件

**Files:**
- Create: `apps/web/src/components/board/panels/variants/shared/ReferenceChip.tsx`
- Create: `apps/web/src/components/board/panels/variants/shared/TextReferencePool.tsx`
- Create: `apps/web/src/components/board/panels/variants/shared/ReferenceDropdown.tsx`

- [ ] **Step 1: 创建 ReferenceChip**

```typescript
// apps/web/src/components/board/panels/variants/shared/ReferenceChip.tsx
'use client'
import { Link2, X } from 'lucide-react'
import { cn } from '@udecode/cn'
import type { TextReference } from '../slot-types'

interface ReferenceChipProps {
  reference: TextReference
  /** inline = 在输入框内（紧凑），pool = 在待分配池中（完整） */
  mode: 'inline' | 'pool'
  /** 是否可移除 */
  removable?: boolean
  /** 是否可拖拽 */
  draggable?: boolean
  onRemove?: () => void
  onClick?: () => void
  /** hover 时显示完整内容 */
  className?: string
}

export function ReferenceChip({
  reference,
  mode,
  removable,
  draggable,
  onRemove,
  onClick,
  className,
}: ReferenceChipProps) {
  const maxPreview = mode === 'inline' ? 8 : 16
  const preview = reference.content.length > maxPreview
    ? `${reference.content.slice(0, maxPreview)}...`
    : reference.content

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-[11px] leading-tight',
        'bg-ol-blue-bg text-ol-blue',
        draggable && 'cursor-grab active:cursor-grabbing',
        onClick && 'cursor-pointer hover:border-ol-blue/30',
        className,
      )}
      draggable={draggable}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({
          type: 'text-reference',
          nodeId: reference.nodeId,
        }))
      } : undefined}
      onClick={onClick}
      title={reference.content}
    >
      <Link2 size={10} className="shrink-0" />
      <span className="shrink-0 font-medium">{reference.label}</span>
      {mode === 'pool' && (
        <span className="min-w-0 truncate text-ol-blue/60">{preview}</span>
      )}
      <span className="shrink-0 text-ol-blue/50">({reference.charCount})</span>
      {removable && onRemove && (
        <button
          type="button"
          className="ml-0.5 shrink-0 rounded-sm p-0.5 hover:bg-ol-blue/20"
          onPointerDown={(e) => { e.stopPropagation(); onRemove() }}
        >
          <X size={8} />
        </button>
      )}
    </span>
  )
}
```

- [ ] **Step 2: 创建 TextReferencePool**

```typescript
// apps/web/src/components/board/panels/variants/shared/TextReferencePool.tsx
'use client'
import { useTranslation } from 'react-i18next'
import { ReferenceChip } from './ReferenceChip'
import type { TextReference } from '../slot-types'

interface TextReferencePoolProps {
  references: TextReference[]
  onInsert: (ref: TextReference, targetSlotId?: string) => void
}

export function TextReferencePool({ references, onInsert }: TextReferencePoolProps) {
  const { t } = useTranslation('board')
  if (references.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-muted/30 px-2 py-1.5">
      <span className="text-[10px] text-muted-foreground/60">
        {t('slot.unassignedTexts')}
      </span>
      {references.map((ref) => (
        <ReferenceChip
          key={ref.nodeId}
          reference={ref}
          mode="pool"
          draggable
          onClick={() => onInsert(ref)}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: 创建 ReferenceDropdown（@ 菜单）**

复用 `ChatAgentMention` 的键盘导航和定位模式：

```typescript
// apps/web/src/components/board/panels/variants/shared/ReferenceDropdown.tsx
'use client'
import { forwardRef, useImperativeHandle, useMemo, useState, useCallback } from 'react'
import { Link2 } from 'lucide-react'
import { cn } from '@udecode/cn'
import type { TextReference } from '../slot-types'

export interface ReferenceDropdownHandle {
  handleKeyDown: (e: React.KeyboardEvent) => boolean
}

interface ReferenceDropdownProps {
  query: string
  references: TextReference[]
  /** Already assigned in current slot (shown greyed) */
  assignedNodeIds: Set<string>
  onSelect: (ref: TextReference) => void
  onClose: () => void
  position: { left: number; top: number }
}

export const ReferenceDropdown = forwardRef<ReferenceDropdownHandle, ReferenceDropdownProps>(
  function ReferenceDropdown({ query, references, assignedNodeIds, onSelect, onClose, position }, ref) {
    const [activeIdx, setActiveIdx] = useState(0)

    const filtered = useMemo(() =>
      references.filter(r =>
        r.label.toLowerCase().includes(query.toLowerCase()) ||
        r.content.toLowerCase().includes(query.toLowerCase()),
      ),
      [references, query],
    )

    useImperativeHandle(ref, () => ({
      handleKeyDown(e: React.KeyboardEvent) {
        if (!filtered.length) return false
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActiveIdx(i => (i + 1) % filtered.length)
          return true
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActiveIdx(i => (i - 1 + filtered.length) % filtered.length)
          return true
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          onSelect(filtered[activeIdx])
          return true
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
          return true
        }
        return false
      },
    }))

    if (filtered.length === 0) return null

    return (
      <div
        className="fixed z-50 w-64 rounded-2xl border border-border bg-card p-1 shadow-lg"
        style={{ left: position.left, top: position.top }}
      >
        {filtered.map((ref, idx) => {
          const isAssigned = assignedNodeIds.has(ref.nodeId)
          return (
            <button
              key={ref.nodeId}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs',
                idx === activeIdx && 'bg-muted',
                isAssigned && 'opacity-40',
              )}
              onPointerDown={(e) => {
                e.preventDefault()
                if (!isAssigned) onSelect(ref)
              }}
            >
              <Link2 size={12} className="shrink-0 text-ol-blue" />
              <span className="shrink-0 font-medium">{ref.label}</span>
              <span className="min-w-0 truncate text-muted-foreground">
                {ref.content.slice(0, 20)}
              </span>
              <span className="ml-auto shrink-0 text-muted-foreground/60">
                {ref.charCount}
              </span>
            </button>
          )
        })}
      </div>
    )
  },
)
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/panels/variants/shared/ReferenceChip.tsx \
       apps/web/src/components/board/panels/variants/shared/TextReferencePool.tsx \
       apps/web/src/components/board/panels/variants/shared/ReferenceDropdown.tsx
git commit -m "feat(board): add text reference chip, pool, and dropdown components"
```

---

### Task 2.4: TextSlotField 组件（带 @ 引用的文本输入框）

**Files:**
- Create: `apps/web/src/components/board/panels/variants/shared/TextSlotField.tsx`

- [ ] **Step 1: 创建 TextSlotField**

这是核心组件——一个支持内联 ReferenceChip 的 contentEditable 文本框。复用 `ChatInputEditor` 的 chip 渲染模式。

```typescript
// apps/web/src/components/board/panels/variants/shared/TextSlotField.tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextReference } from '../slot-types'
import { ReferenceChip } from './ReferenceChip'
import { ReferenceDropdown, type ReferenceDropdownHandle } from './ReferenceDropdown'

interface TextSlotFieldProps {
  label: string
  /** Current references assigned to this slot */
  references: TextReference[]
  /** User-typed text */
  userText: string
  /** All available text references (for @ menu) */
  allReferences: TextReference[]
  /** Node IDs already assigned across all slots */
  assignedNodeIds: Set<string>
  placeholder?: string
  required?: boolean
  disabled?: boolean
  mode: 'inline' | 'replace'
  onUserTextChange: (text: string) => void
  onAddReference: (ref: TextReference) => void
  onRemoveReference: (nodeId: string) => void
}

export function TextSlotField({
  label,
  references,
  userText,
  allReferences,
  assignedNodeIds,
  placeholder,
  required,
  disabled,
  mode,
  onUserTextChange,
  onAddReference,
  onRemoveReference,
}: TextSlotFieldProps) {
  const { t } = useTranslation('board')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<ReferenceDropdownHandle>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [dropdownQuery, setDropdownQuery] = useState('')
  const [dropdownPos, setDropdownPos] = useState({ left: 0, top: 0 })

  // Detect @ trigger in textarea
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    onUserTextChange(value)

    // Check for @ trigger at end
    const match = value.match(/@(\S*)$/)
    if (match) {
      setDropdownQuery(match[1])
      setShowDropdown(true)
      // Position dropdown below cursor
      if (textareaRef.current) {
        const rect = textareaRef.current.getBoundingClientRect()
        setDropdownPos({ left: rect.left, top: rect.bottom + 4 })
      }
    } else {
      setShowDropdown(false)
    }
  }, [onUserTextChange])

  const handleSelectReference = useCallback((ref: TextReference) => {
    // Remove @ query from text
    const cleaned = userText.replace(/@\S*$/, '')
    onUserTextChange(cleaned)
    onAddReference(ref)
    setShowDropdown(false)
    textareaRef.current?.focus()
  }, [userText, onUserTextChange, onAddReference])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showDropdown && dropdownRef.current?.handleKeyDown(e)) return
  }, [showDropdown])

  // Handle drop from TextReferencePool
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'))
      if (data.type === 'text-reference') {
        const ref = allReferences.find(r => r.nodeId === data.nodeId)
        if (ref) onAddReference(ref)
      }
    } catch { /* ignore */ }
  }, [allReferences, onAddReference])

  if (mode === 'replace' && references.length > 0) {
    // Replace mode: show full content read-only
    const ref = references[0]
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
          <button
            type="button"
            className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground"
            onPointerDown={() => onRemoveReference(ref.nodeId)}
          >
            {t('slot.clearReference')}
          </button>
        </div>
        <div className="rounded-2xl bg-muted/30 p-2">
          <ReferenceChip reference={ref} mode="pool" />
          <p className="mt-1 max-h-20 overflow-y-auto text-xs text-muted-foreground">
            {ref.content}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        {required && <span className="text-[10px] text-red-400">*</span>}
      </div>

      {/* Inline reference chips above textarea */}
      {references.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {references.map(ref => (
            <ReferenceChip
              key={ref.nodeId}
              reference={ref}
              mode="inline"
              removable
              onRemove={() => onRemoveReference(ref.nodeId)}
            />
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={userText}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        placeholder={placeholder ?? t('slot.textPlaceholder')}
        disabled={disabled}
        className="min-h-[60px] w-full resize-none rounded-2xl bg-muted/30 px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/40"
        rows={3}
      />

      {showDropdown && (
        <ReferenceDropdown
          ref={dropdownRef}
          query={dropdownQuery}
          references={allReferences}
          assignedNodeIds={assignedNodeIds}
          onSelect={handleSelectReference}
          onClose={() => setShowDropdown(false)}
          position={dropdownPos}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/board/panels/variants/shared/TextSlotField.tsx
git commit -m "feat(board): add TextSlotField with @ reference support"
```

---

### Task 2.5: MediaSlotGroup + OverflowHint + InputSlotBar 统一入口

**Files:**
- Create: `apps/web/src/components/board/panels/variants/shared/MediaSlotGroup.tsx`
- Create: `apps/web/src/components/board/panels/variants/shared/OverflowHint.tsx`
- Create: `apps/web/src/components/board/panels/variants/shared/InputSlotBar.tsx`

- [ ] **Step 1: 创建 MediaSlotGroup（图片/视频/音频插槽组）**

**重要：** 既有 `MediaSlot` 组件（`shared/MediaSlot.tsx`）保留不变。`MediaSlotGroup` 是对 `MediaSlot` 的**组合封装**——内部使用 `<MediaSlot />` 渲染每个单独的媒体项，外层添加溢出处理逻辑。不要创建平行的替代品。

处理三种溢出交互：轮换（rotate）、截断+提示（truncate）、单媒体。

- [ ] **Step 2: 创建 OverflowHint**

显示 "N 张图片未使用" + 缩略图列表 + 点击替换。

- [ ] **Step 3: 创建 InputSlotBar**

顶层容器，接收 `InputSlotDefinition[]` + `SlotAssignment`，自动渲染对应的 `TextSlotField` / `MediaSlotGroup`：

```typescript
// apps/web/src/components/board/panels/variants/shared/InputSlotBar.tsx
// 核心逻辑：
// 1. 调用 assignUpstreamToSlots() 自动分配
// 2. 维护用户手动调整状态（override assignment）
// 3. 渲染 TextReferencePool（未分配的文本引用）
// 4. 按 slot 声明渲染 TextSlotField / MediaSlotGroup
// 5. 暴露 getResolvedInputs() 给父组件用于 API 提交
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/panels/variants/shared/MediaSlotGroup.tsx \
       apps/web/src/components/board/panels/variants/shared/OverflowHint.tsx \
       apps/web/src/components/board/panels/variants/shared/InputSlotBar.tsx
git commit -m "feat(board): add InputSlotBar with MediaSlotGroup and OverflowHint"
```

---

### Task 2.6: 集成到 AI 面板

**Files:**
- Modify: `apps/web/src/components/board/panels/ImageAiPanel.tsx`
- Modify: `apps/web/src/components/board/panels/VideoAiPanel.tsx`
- Modify: `apps/web/src/components/board/panels/AudioAiPanel.tsx`

- [ ] **Step 1: 在 ImageAiPanel 中集成 InputSlotBar**

替换当前手动构建 `VariantUpstream` 并传给 variant 组件的模式。改为：
1. 用 `buildReferencePools()` 构建引用池
2. 从当前选中 variant 的 `inputSlots` 获取插槽声明
3. 用 `assignUpstreamToSlots()` 自动分配
4. 渲染 `<InputSlotBar />` 在 variant 表单上方
5. variant 组件通过 `slotAssignment` prop 获取已分配的引用

- [ ] **Step 2: 在 VideoAiPanel 和 AudioAiPanel 中同样集成**

- [ ] **Step 3: 验证所有 variant 的输入行为正确**

逐一测试：文生图、高清放大、图片编辑、视频生成、口型同步、TTS 等。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/panels/ImageAiPanel.tsx \
       apps/web/src/components/board/panels/VideoAiPanel.tsx \
       apps/web/src/components/board/panels/AudioAiPanel.tsx
git commit -m "feat(board): integrate InputSlotBar into AI panels"
```

---

### Task 2.7: i18n 补充

**Files:**
- Modify: `apps/web/src/i18n/locales/zh-CN/board.json`
- Modify: `apps/web/src/i18n/locales/en-US/board.json`
- Modify: `apps/web/src/i18n/locales/ja-JP/board.json`
- Modify: `apps/web/src/i18n/locales/zh-TW/board.json`

- [ ] **Step 1: 新增插槽相关翻译 key**

```json
{
  "slot.prompt": "正向提示词",
  "slot.negativePrompt": "反向提示词",
  "slot.sourceImage": "源图片",
  "slot.referenceImages": "参考图片",
  "slot.startFrame": "首帧图片",
  "slot.audio": "音频",
  "slot.video": "视频",
  "slot.text": "文本",
  "slot.editInstruction": "编辑指令",
  "slot.person": "人物图片",
  "slot.face": "人脸图片",
  "slot.textPlaceholder": "输入文本或 @ 引用上游便签...",
  "slot.unassignedTexts": "待分配文本：",
  "slot.clearReference": "清除引用",
  "slot.overflow": "{{count}} 项未使用",
  "slot.overflowReason": "该功能最多支持 {{max}} 项",
  "slot.clickToReplace": "点击替换",
  "slot.fromNode": "来自「{{name}}」"
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/i18n/locales/*/board.json
git commit -m "feat(i18n): add InputSlot translation keys for all locales"
```

---

## Phase 3: 锚点方向化

> 目标：左锚点 = Input Port, 右锚点 = Output Port，拖拽行为区分方向。

### Task 3.1: 方向类型 + 锚点元数据

**Files:**
- Create: `apps/web/src/components/board/engine/anchor-direction.ts`
- Modify: `apps/web/src/components/board/engine/types.ts`
- Modify: `apps/web/src/components/board/engine/anchorTypes.ts`

- [ ] **Step 1: 创建方向常量和工具函数**

```typescript
// apps/web/src/components/board/engine/anchor-direction.ts
export type AnchorDirection = 'input' | 'output'

/** Map anchor ID to its semantic direction. */
export function getAnchorDirection(anchorId: string): AnchorDirection {
  return anchorId === 'left' ? 'input' : 'output'
}

/** Check if a connection direction is valid (output → input). */
export function isValidConnectionDirection(
  sourceAnchorId: string,
  targetAnchorId: string,
): boolean {
  return getAnchorDirection(sourceAnchorId) === 'output'
    && getAnchorDirection(targetAnchorId) === 'input'
}
```

- [ ] **Step 2: 在 CanvasNodeDefinition 中新增 outputTypes**

```typescript
// types.ts — CanvasNodeDefinition 新增
export type CanvasNodeDefinition<P> = {
  // ...existing
  /** 该节点可输出的媒体类型 */
  outputTypes?: MediaType[]
}
```

在各节点定义中设置：
- ImageNodeDefinition: `outputTypes: ['image']`
- VideoNodeDefinition: `outputTypes: ['video', 'image']`
- AudioNodeDefinition: `outputTypes: ['audio']`
- TextNodeDefinition: `outputTypes: ['text']`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/engine/anchor-direction.ts \
       apps/web/src/components/board/engine/types.ts \
       apps/web/src/components/board/engine/anchorTypes.ts \
       apps/web/src/components/board/nodes/ImageNode.tsx \
       apps/web/src/components/board/nodes/VideoNode.tsx \
       apps/web/src/components/board/nodes/AudioNode.tsx \
       apps/web/src/components/board/nodes/TextNode.tsx
git commit -m "feat(board): add anchor direction semantics and outputTypes declarations"
```

---

### Task 3.2: AnchorOverlay 视觉方向提示

**Files:**
- Modify: `apps/web/src/components/board/core/AnchorOverlay.tsx`

- [ ] **Step 1: 左右锚点显示不同的方向箭头**

在 AnchorOverlay 中根据 `anchor.id === 'left'` vs `'right'` 渲染不同的图标/样式：
- 左锚点（input）：hover 时显示 `←` 或凹槽样式
- 右锚点（output）：hover 时显示 `→` 或凸出样式

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/board/core/AnchorOverlay.tsx
git commit -m "feat(board): add directional visual hints to anchor overlay"
```

---

### Task 3.3: SelectTool 方向化拖拽

**Files:**
- Modify: `apps/web/src/components/board/tools/SelectTool.ts`
- Modify: `apps/web/src/components/board/core/BoardCanvasInteraction.tsx`

- [ ] **Step 1: 修改 SelectTool 的 connector 拖拽逻辑**

在 `onPointerDown` 创建 `connectorDraft` 时，记录源锚点方向：
- 从右锚点拖出 → `draft.direction = 'forward'`（正向，创建下游节点）
- 从左锚点拖出 → `draft.direction = 'backward'`（反向，创建上游节点）

在 `onPointerMove` 中，拖向目标节点时：
- forward draft → 只 snap 到目标的左锚点（input）
- backward draft → 只 snap 到目标的右锚点（output）

- [ ] **Step 2: 修改 BoardCanvasInteraction 的 connectorDrop 处理**

`connectorDrop` 时传入 `direction`，后续 NodePicker/GroupedNodePicker 根据方向显示不同菜单。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/tools/SelectTool.ts \
       apps/web/src/components/board/core/BoardCanvasInteraction.tsx
git commit -m "feat(board): implement directional connector drag (left=input, right=output)"
```

---

## Phase 4: 动态分组式 NodePicker

> 目标：替换扁平模板列表，改为根据 variant 声明动态生成分组菜单。

### Task 4.1: 动态模板计算引擎

**Files:**
- Create: `apps/web/src/components/board/engine/dynamic-templates.ts`

- [ ] **Step 1: 实现 computeOutputTemplates**

```typescript
// apps/web/src/components/board/engine/dynamic-templates.ts
import { IMAGE_VARIANTS } from '../panels/variants/image'
import { VIDEO_VARIANTS } from '../panels/variants/video'
import { AUDIO_VARIANTS } from '../panels/variants/audio'
import type { MediaType, InputSlotDefinition } from '../panels/variants/slot-types'
import type { VariantDefinition } from '../panels/variants/types'

interface TemplateGroup {
  id: MediaType
  labelKey: string
  icon: string  // lucide icon name
  items: TemplateItem[]
}

interface TemplateItem {
  variantId: string
  labelKey: string
  descriptionKey?: string
  nodeType: string
  nodeSize: [number, number]
  preselect: { featureId: string; variantId: string }
  /** 源节点 outputTypes 不能完全满足该 variant 的 acceptsInputTypes */
  missingInputTypes: MediaType[]
}

const ALL_VARIANTS: Record<string, VariantDefinition> = {
  ...IMAGE_VARIANTS,
  ...VIDEO_VARIANTS,
  ...AUDIO_VARIANTS,
}

const OUTPUT_TYPE_TO_NODE: Record<MediaType, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  text: 'text',
}

const OUTPUT_TYPE_TO_SIZE: Record<MediaType, [number, number]> = {
  image: [320, 180],
  video: [320, 180],
  audio: [320, 120],
  text: [200, 200],
}

/**
 * Dynamically compute FORWARD templates (right anchor → create downstream node).
 * Based on: which variants can accept sourceOutputTypes as input?
 */
export function computeOutputTemplates(
  sourceOutputTypes: MediaType[],
): TemplateGroup[] {
  const grouped = new Map<MediaType, TemplateItem[]>()

  for (const [variantId, def] of Object.entries(ALL_VARIANTS)) {
    // Check if source can provide ANY input this variant needs
    const overlap = def.acceptsInputTypes.filter(t => sourceOutputTypes.includes(t))
    if (overlap.length === 0) continue

    const missing = def.acceptsInputTypes.filter(t => !sourceOutputTypes.includes(t))
    const outputType = def.producesOutputType

    if (!grouped.has(outputType)) grouped.set(outputType, [])
    grouped.get(outputType)!.push({
      variantId,
      labelKey: `variant.${variantId}.label`,
      nodeType: OUTPUT_TYPE_TO_NODE[outputType],
      nodeSize: OUTPUT_TYPE_TO_SIZE[outputType],
      preselect: {
        featureId: resolveFeatureId(variantId),
        variantId,
      },
      missingInputTypes: missing,
    })
  }

  // Convert to sorted array
  const order: MediaType[] = ['text', 'image', 'video', 'audio']
  return order
    .filter(type => grouped.has(type))
    .map(type => ({
      id: type,
      labelKey: `nodeType.${type}`,
      icon: type,
      items: grouped.get(type)!,
    }))
}

/** Reverse lookup: variant ID → feature ID */
function resolveFeatureId(variantId: string): string {
  // Based on variant ID prefix convention:
  // OL-IG → imageGenerate, OL-UP → upscale, etc.
  // This mapping should be maintained or derived from capabilities API
  const prefixMap: Record<string, string> = {
    'OL-IG': 'imageGenerate',
    'OL-IP': 'imageInpaint',
    'OL-ST': 'styleTransfer',
    'OL-UP': 'upscale',
    'OL-OP': 'outpaint',
    'OL-IE': 'imageEdit',
    'OL-ME': 'materialExtract',
    'OL-VG': 'videoGenerate',
    'OL-LS': 'lipSync',
    'OL-DH': 'digitalHuman',
    'OL-FS': 'faceSwap',
    'OL-VT': 'videoTranslate',
    'OL-TT': 'tts',
    'OL-SR': 'speechRecognition',
  }
  const prefix = variantId.slice(0, 5)
  return prefixMap[prefix] ?? variantId
}
```

- [ ] **Step 2: 实现 computeInputTemplates（反向/左锚点拖出）**

在同一文件中新增：

```typescript
/**
 * Dynamically compute BACKWARD templates (left anchor → create upstream node).
 * Based on: which node types can output what this node's variants accept?
 */
export function computeInputTemplates(
  targetNodeType: string,
): TemplateGroup[] {
  // 1. 收集目标节点所有 variant 的 acceptsInputTypes 并集
  const registry = getVariantRegistryForNodeType(targetNodeType)
  const allAccepts = new Set<MediaType>()
  for (const def of Object.values(registry)) {
    if (def.acceptsInputTypes) {
      for (const t of def.acceptsInputTypes) allAccepts.add(t)
    }
  }

  // 2. 为每个接受的类型创建一个"上游节点"模板
  const order: MediaType[] = ['text', 'image', 'video', 'audio']
  return order
    .filter(type => allAccepts.has(type))
    .map(type => ({
      id: type,
      labelKey: `nodeType.${type}`,
      icon: type,
      items: [{
        variantId: `__source_${type}__`,
        labelKey: `inputTemplate.${type}`,
        nodeType: OUTPUT_TYPE_TO_NODE[type],
        nodeSize: OUTPUT_TYPE_TO_SIZE[type],
        preselect: { featureId: '', variantId: '' },
        missingInputTypes: [],
      }],
    }))
}

function getVariantRegistryForNodeType(nodeType: string) {
  switch (nodeType) {
    case 'image': return IMAGE_VARIANTS
    case 'video': return VIDEO_VARIANTS
    case 'audio': return AUDIO_VARIANTS
    default: return {}
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/engine/dynamic-templates.ts
git commit -m "feat(board): add dynamic template computation engine (forward + backward)"
```

---

### Task 4.2: GroupedNodePicker 组件

**Files:**
- Create: `apps/web/src/components/board/core/GroupedNodePicker.tsx`

- [ ] **Step 1: 创建分组式节点选择菜单**

复用 `ScrollableTabBar` 或自建分组 UI：

```
┌─────────────────────────────────────┐
│  文本                                │
│  ┌────────┐                         │
│  │ 📝 描述 │                         │
│  └────────┘                         │
│  图片                                │
│  ┌────────┐ ┌────────┐ ┌────────┐  │
│  │ 🖌️ 编辑 │ │ 🔍 高清 │ │ 📐 扩图 │  │
│  └────────┘ └────────┘ └────────┘  │
│  ┌────────┐ ┌────────┐ ┌────────┐  │
│  │ 🎨 风格 │ │ ✂️ 重绘 │ │ 🧱 材质 │  │
│  └────────┘ └────────┘ └────────┘  │
│  视频                                │
│  ┌────────┐ ┌──────────────────┐   │
│  │ 🎬 生成 │ │ 🗣️ 数字人 *需音频 │   │
│  └────────┘ └──────────────────┘   │
└─────────────────────────────────────┘
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/board/core/GroupedNodePicker.tsx
git commit -m "feat(board): add GroupedNodePicker with categorized variant menu"
```

---

### Task 4.3: 集成到 BoardCanvasInteraction

**Files:**
- Modify: `apps/web/src/components/board/core/BoardCanvasInteraction.tsx`

- [ ] **Step 1: 替换 NodePicker 为 GroupedNodePicker**

在 `handleTemplateSelect` 中：
1. 调用 `computeOutputTemplates(sourceNode.outputTypes)` 获取动态模板
2. 渲染 `GroupedNodePicker` 而非 `NodePicker`
3. 选择模板后，创建新节点并写入 `preselect` 到 aiConfig

- [ ] **Step 2: 删除各节点的静态 connectorTemplates**

移除 `ImageNode.tsx`、`VideoNode.tsx`、`AudioNode.tsx`、`TextNode.tsx` 中的 `getXxxNodeConnectorTemplates()` 函数和 `connectorTemplates` 属性。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/core/BoardCanvasInteraction.tsx \
       apps/web/src/components/board/nodes/ImageNode.tsx \
       apps/web/src/components/board/nodes/VideoNode.tsx \
       apps/web/src/components/board/nodes/AudioNode.tsx \
       apps/web/src/components/board/nodes/TextNode.tsx
git commit -m "feat(board): replace static connectorTemplates with dynamic GroupedNodePicker"
```

---

## Phase 5: 连接校验与视觉反馈

> 目标：拖拽连线时实时校验方向和类型兼容性，不兼容时显示视觉反馈。

### Task 5.1: 连接校验引擎

**Files:**
- Create: `apps/web/src/components/board/engine/connection-validator.ts`

- [ ] **Step 1: 实现校验逻辑**

```typescript
// apps/web/src/components/board/engine/connection-validator.ts
import type { MediaType } from '../panels/variants/slot-types'
import type { CanvasNodeElement } from './types'
import { IMAGE_VARIANTS } from '../panels/variants/image'
import { VIDEO_VARIANTS } from '../panels/variants/video'
import { AUDIO_VARIANTS } from '../panels/variants/audio'
import { getAnchorDirection } from './anchor-direction'

const ALL_VARIANTS = { ...IMAGE_VARIANTS, ...VIDEO_VARIANTS, ...AUDIO_VARIANTS }

export type ConnectionValidation = {
  valid: boolean
  reason?: 'direction-mismatch' | 'type-incompatible' | 'self-loop'
}

/**
 * Validate whether a connection from sourceAnchor to targetAnchor is allowed.
 */
export function validateConnection(
  sourceNode: CanvasNodeElement<any>,
  sourceAnchorId: string,
  targetNode: CanvasNodeElement<any>,
  targetAnchorId: string,
  nodeDefinitions: Map<string, { outputTypes?: MediaType[] }>,
): ConnectionValidation {
  // Self-loop
  if (sourceNode.id === targetNode.id) {
    return { valid: false, reason: 'self-loop' }
  }

  // Direction check: must be output → input
  const sourceDir = getAnchorDirection(sourceAnchorId)
  const targetDir = getAnchorDirection(targetAnchorId)
  if (sourceDir !== 'output' || targetDir !== 'input') {
    return { valid: false, reason: 'direction-mismatch' }
  }

  // Type compatibility check
  const sourceDef = nodeDefinitions.get(sourceNode.type)
  const sourceOutputs = sourceDef?.outputTypes ?? []

  // 只检查目标节点类型对应的 variant 注册表
  // (image 节点 → IMAGE_VARIANTS, video → VIDEO_VARIANTS, audio → AUDIO_VARIANTS)
  const targetVariantRegistry = getVariantRegistryForNodeType(targetNode.type)
  const targetAccepts = new Set<MediaType>()
  for (const def of Object.values(targetVariantRegistry)) {
    if (def.acceptsInputTypes) {
      for (const inputType of def.acceptsInputTypes) {
        targetAccepts.add(inputType)
      }
    }
  }

  // 如果目标节点无已声明的 variant（如 text 节点），则允许所有连接（兼容旧行为）
  if (targetAccepts.size === 0) {
    return { valid: true }
  }

  const hasOverlap = sourceOutputs.some(t => targetAccepts.has(t))
  if (!hasOverlap) {
    return { valid: false, reason: 'type-incompatible' }
  }

  return { valid: true }
}

function getVariantRegistryForNodeType(nodeType: string): Record<string, VariantDefinition> {
  switch (nodeType) {
    case 'image': return IMAGE_VARIANTS
    case 'video': return VIDEO_VARIANTS
    case 'audio': return AUDIO_VARIANTS
    default: return {}
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/board/engine/connection-validator.ts
git commit -m "feat(board): add connection validation engine"
```

---

### Task 5.2: 拖拽时的视觉反馈

**Files:**
- Modify: `apps/web/src/components/board/tools/SelectTool.ts`
- Modify: `apps/web/src/components/board/core/AnchorOverlay.tsx`

- [ ] **Step 1: SelectTool 拖拽中调用 validateConnection**

在 `onPointerMove` 中 hover 到目标节点时：
- 调用 `validateConnection()` 校验
- 将校验结果传入 engine state（如 `engine.setConnectorValidation(result)`）

- [ ] **Step 2: AnchorOverlay 显示校验反馈**

- 兼容：目标锚点放大 + 绿色高亮
- 不兼容：目标锚点变红 + 不响应 snap
- 方向不匹配（output→output）：目标锚点不高亮

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/tools/SelectTool.ts \
       apps/web/src/components/board/core/AnchorOverlay.tsx
git commit -m "feat(board): add real-time connection validation visual feedback"
```

---

## 附录 A: 完整 Variant 插槽声明表

| Variant ID | acceptsInputTypes | producesOutputType | inputSlots |
|-----------|-------------------|-------------------|------------|
| OL-IG-001 | `['text']` | `'image'` | `prompt(text,0,1,merge,inline)` |
| OL-IG-002 | `['text']` | `'image'` | `prompt(text,0,1,merge,inline)` |
| OL-IG-003 | `['text']` | `'image'` | `prompt(text,0,1,merge,inline)` |
| OL-IP-001 | `['image']` | `'image'` | `prompt(text,0,1,merge,inline)` + `image(image,1,1,rotate)` |
| OL-ST-001 | `['image']` | `'image'` | `prompt(text,0,1,merge,inline)` + `style(image,1,1,rotate)` |
| OL-ST-002 | `['image']` | `'image'` | `prompt(text,0,1,merge,inline)` + `style(image,1,1,rotate)` |
| OL-UP-001 | `['image']` | `'image'` | `image(image,1,1,rotate)` |
| OL-OP-001 | `['image']` | `'image'` | `image(image,1,1,rotate)` |
| OL-IE-001 | `['image']` | `'image'` | `prompt(text,1,1,merge,inline)` + `images(image,0,4,truncate)` |
| OL-IE-002 | `['image']` | `'image'` | `prompt(text,1,1,merge,inline)` + `images(image,1,3,truncate)` |
| OL-ME-001 | `['image']` | `'image'` | `image(image,1,1,rotate)` |
| OL-VG-001 | `['image']` | `'video'` | `prompt(text,0,1,merge,inline)` + `startFrame(image,1,1,rotate)` |
| OL-VG-002 | `['image']` | `'video'` | `prompt(text,0,1,merge,inline)` + `startFrame(image,1,1,rotate)` |
| OL-VG-003 | `['image','text']` | `'video'` | `prompt(text,1,1,merge,inline)` + `startFrame(image,0,1,rotate)` + `refs(image,0,3,truncate)` |
| OL-LS-001 | `['image','audio']` | `'video'` | `person(image,1,1,rotate)` + `audio(audio,1,1,rotate)` |
| OL-DH-001 | `['image','audio']` | `'video'` | `image(image,1,1,rotate)` + `audio(audio,1,1,rotate)` |
| OL-FS-001 | `['image','video']` | `'video'` | `face(image,1,1,rotate)` + `video(video,1,1,rotate)` |
| OL-FS-002 | `['image','video']` | `'video'` | `face(image,1,1,rotate)` + `video(video,1,1,rotate)` |
| OL-VT-001 | `['video']` | `'video'` | `video(video,1,1,rotate)` + `sourceLang(text,0,1,merge,replace)` + `targetLang(text,0,1,merge,replace)` |
| OL-TT-001 | `['text']` | `'audio'` | `text(text,1,1,merge,replace)` |
| OL-TT-002 | `['text']` | `'audio'` | `text(text,1,1,merge,replace)` |
| OL-SR-001 | `['audio']` | `'text'` | `audio(audio,1,1,rotate)` |

---

## 附录 B: 连接兼容矩阵

| Source \ Target | Image | Video | Audio | Text |
|:---:|:---:|:---:|:---:|:---:|
| **Image** | ✅ 编辑/高清/扩图/风格/重绘/材质 | ✅ 图生视频/数字人*/换脸* | ❌ | ✅ 图片描述 |
| **Video** | ✅ 提帧 | ✅ 续写/翻译/换脸* | ❌ | ✅ 视频理解 |
| **Audio** | ❌ | ✅ 口型同步*/数字人* | ✅ TTS变换 | ✅ 语音转文字 |
| **Text** | ✅ 文生图 | ✅ 文生视频 | ✅ TTS | ✅ AI润色 |

`*` 表示需要额外输入（如数字人需要图片+音频两路输入）
