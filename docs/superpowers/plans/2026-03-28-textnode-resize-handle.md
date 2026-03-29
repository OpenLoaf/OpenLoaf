# TextNode 右下角 Resize Handle 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 TextNode 添加右下角 resize 手柄，允许用户自由调整宽度和高度，手柄渲染在节点 DOM 内部确保零帧差同步。

**Architecture:** 在 `DomNodeLayer` 的 `DomNodeItem` 中新增一个通用 `ResizeHandle` 组件，通过 `data-resize-handle` 属性让 SelectTool 自动放行。拖拽过程中用 `useRef` + 直接操作 DOM style 避免 React 重渲染，仅在 pointerUp 时写入 Yjs 并 commitHistory。内容超出高度时底部渐隐遮罩提示。

**Tech Stack:** React 19, TypeScript, CSS, Yjs (via CanvasEngine)

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `apps/web/src/components/board/nodes/ResizeHandle.tsx` | 通用右下角 resize 手柄组件 |
| Modify | `apps/web/src/components/board/render/pixi/DomNodeLayer.tsx` | 在 `DomNodeItem` 中渲染 resize handle |
| Modify | `apps/web/src/components/board/nodes/TextNode.tsx` | 启用 `resizable: true`，添加底部渐隐遮罩 |
| Modify | `apps/web/src/components/board/engine/types.ts` | 无需修改（`resizable` 类型已存在） |

---

### Task 1: 创建 ResizeHandle 组件

**Files:**
- Create: `apps/web/src/components/board/nodes/ResizeHandle.tsx`

- [ ] **Step 1: 创建 ResizeHandle 组件文件**

```tsx
// apps/web/src/components/board/nodes/ResizeHandle.tsx
'use client'

import { useCallback, useRef } from 'react'
import type { CanvasEngine } from '../engine/CanvasEngine'
import type { CanvasNodeElement } from '../engine/types'

type ResizeHandleProps = {
  engine: CanvasEngine
  element: CanvasNodeElement
  /** 最小宽度 (世界坐标) */
  minW?: number
  /** 最大宽度 (世界坐标) */
  maxW?: number
  /** 最小高度 (世界坐标) */
  minH?: number
  /** 最大高度 (世界坐标) */
  maxH?: number
}

type DragState = {
  startScreenX: number
  startScreenY: number
  startW: number
  startH: number
  /** 缓存 zoom，拖拽期间不变 */
  zoom: number
  /** 节点的父容器 DOM（DomNodeItem 的 div） */
  nodeDiv: HTMLElement
}

/**
 * 右下角 resize 手柄。渲染在节点 DOM 内部，天然跟随 CSS transform 同步。
 *
 * 拖拽期间直接操作 DOM style（不触发 React 重渲染），
 * pointerUp 时才写入 Yjs + commitHistory。
 */
export function ResizeHandle({
  engine,
  element,
  minW = 120,
  maxW = 2000,
  minH = 40,
  maxH = 10000,
}: ResizeHandleProps) {
  const dragRef = useRef<DragState | null>(null)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // 阻止事件冒泡到 SelectTool 的拖拽逻辑
      e.stopPropagation()
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)

      const zoom = engine.viewport.getState().zoom
      const [, , w, h] = element.xywh

      // 找到 DomNodeItem 的外层 div（data-board-node）
      const nodeDiv = e.currentTarget.closest('[data-board-node]') as HTMLElement | null
      if (!nodeDiv) return

      dragRef.current = {
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startW: w,
        startH: h,
        zoom,
        nodeDiv,
      }
    },
    [engine, element.xywh],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return

      const deltaScreenX = e.clientX - drag.startScreenX
      const deltaScreenY = e.clientY - drag.startScreenY

      // 屏幕坐标 → 世界坐标
      const deltaW = deltaScreenX / drag.zoom
      const deltaH = deltaScreenY / drag.zoom

      const newW = Math.max(minW, Math.min(maxW, drag.startW + deltaW))
      const newH = Math.max(minH, Math.min(maxH, drag.startH + deltaH))

      // 直接操作 DOM，不走 React state
      drag.nodeDiv.style.width = `${newW}px`
      drag.nodeDiv.style.height = `${newH}px`
    },
    [minW, maxW, minH, maxH],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null

      const deltaScreenX = e.clientX - drag.startScreenX
      const deltaScreenY = e.clientY - drag.startScreenY
      const deltaW = deltaScreenX / drag.zoom
      const deltaH = deltaScreenY / drag.zoom

      const newW = Math.max(minW, Math.min(maxW, drag.startW + deltaW))
      const newH = Math.max(minH, Math.min(maxH, drag.startH + deltaH))

      const [x, y] = element.xywh

      // 写入 Yjs
      engine.doc.updateElement(element.id, {
        xywh: [x, y, newW, newH],
      })
      engine.commitHistory()
    },
    [engine, element.id, element.xywh, minW, maxW, minH, maxH],
  )

  return (
    <div
      data-resize-handle
      className="pointer-events-auto absolute bottom-0 right-0 z-30 flex h-5 w-5 cursor-nwse-resize items-end justify-end p-0.5 opacity-0 transition-opacity group-hover/node:opacity-100 group-data-[selected]/node:opacity-100"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* 三条斜线 resize 指示器 */}
      <svg width="10" height="10" viewBox="0 0 10 10" className="text-ol-text-auxiliary">
        <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="9" y1="4.5" x2="4.5" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="9" y1="8" x2="8" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  )
}
```

- [ ] **Step 2: 确认文件创建成功**

Run: `ls -la apps/web/src/components/board/nodes/ResizeHandle.tsx`
Expected: 文件存在

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/nodes/ResizeHandle.tsx
git commit -m "feat(board): add ResizeHandle component for node-internal resize"
```

---

### Task 2: 在 DomNodeItem 中集成 ResizeHandle

**Files:**
- Modify: `apps/web/src/components/board/render/pixi/DomNodeLayer.tsx:88-190`

- [ ] **Step 1: 添加 ResizeHandle import**

在 `DomNodeLayer.tsx` 文件顶部 import 区域添加：

```tsx
import { ResizeHandle } from '../../nodes/ResizeHandle'
```

- [ ] **Step 2: 给 DomNodeItem 添加 group class 和 resizable prop**

修改 `DomNodeItem` 的 props 类型，添加 `resizable` 和 `engine` 需要的信息。

在 `DomNodeItemProps` 类型（第 65-78 行附近）中确认 `engine` 已存在。

修改 `DomNodeItem` 的 `return` 中最外层 div（第 109 行），添加 `group/node` class 用于 hover 显示 handle：

```tsx
// 修改第 108-109 行
return (
    <div
      data-board-node
      data-element-id={element.id}
      data-board-editor={editing || undefined}
      data-node-type={element.type}
      data-selected={selected || undefined}
      data-expanded={expanded || undefined}
      data-dragging={dragging || undefined}
      className={cn(
        'group/node absolute overflow-visible',
        editing ? 'select-text' : 'select-none',
        isGroup ? 'pointer-events-none' : 'pointer-events-auto',
      )}
```

注意：只增加 `group/node`，其他不变。

- [ ] **Step 3: 渲染 ResizeHandle**

在 `DomNodeItem` return 的 JSX 中，在 locked 图标之后、闭合 `</div>` 之前（第 176 行之后），添加 resize handle 渲染：

```tsx
      {selected && !isGroup && !element.locked && engine.nodes.getDefinition(element.type)?.capabilities?.resizable && (
        <ResizeHandle
          engine={engine}
          element={element}
          minW={engine.nodes.getDefinition(element.type)?.capabilities?.minSize?.w}
          maxW={engine.nodes.getDefinition(element.type)?.capabilities?.maxSize?.w}
          minH={engine.nodes.getDefinition(element.type)?.capabilities?.minSize?.h}
          maxH={engine.nodes.getDefinition(element.type)?.capabilities?.maxSize?.h}
        />
      )}
```

- [ ] **Step 4: 类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types 2>&1 | tail -20`
Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/render/pixi/DomNodeLayer.tsx
git commit -m "feat(board): integrate ResizeHandle into DomNodeItem"
```

---

### Task 3: 启用 TextNode 的 resizable 能力

**Files:**
- Modify: `apps/web/src/components/board/nodes/TextNode.tsx:1328-1334`

- [ ] **Step 1: 修改 TextNodeDefinition capabilities**

将第 1328-1334 行的 capabilities 从：

```tsx
capabilities: {
    resizable: false,
    rotatable: false,
    connectable: "anchors",
    minSize: TEXT_NODE_MIN_SIZE,
    maxSize: TEXT_NODE_MAX_SIZE,
  },
```

改为：

```tsx
capabilities: {
    resizable: true,
    rotatable: false,
    connectable: "anchors",
    minSize: TEXT_NODE_MIN_SIZE,
    maxSize: TEXT_NODE_MAX_SIZE,
  },
```

仅改 `resizable: false` → `resizable: true`。

- [ ] **Step 2: 类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types 2>&1 | tail -20`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/nodes/TextNode.tsx
git commit -m "feat(board): enable resizable capability for TextNode"
```

---

### Task 4: 添加内容超出时底部渐隐遮罩

**Files:**
- Modify: `apps/web/src/components/board/nodes/TextNode.tsx:1183-1249`

- [ ] **Step 1: 在 EditableTextNodeView 中添加内容溢出检测**

在 `EditableTextNodeView` 函数中（第 805 行开始），`containerRef` 声明附近（约第 867 行），添加溢出检测 state：

```tsx
const [isOverflowing, setIsOverflowing] = useState(false)
```

在 `useEffect` 中使用 ResizeObserver 检测内容是否超出节点高度：

```tsx
useEffect(() => {
  const container = containerRef.current
  if (!container) return

  const checkOverflow = () => {
    setIsOverflowing(container.scrollHeight > container.clientHeight + 2)
  }

  checkOverflow()
  const observer = new ResizeObserver(checkOverflow)
  observer.observe(container)
  return () => observer.disconnect()
}, [element.xywh])
```

- [ ] **Step 2: 渲染渐隐遮罩**

在 `EditableTextNodeView` 的 return JSX 中（第 1183 行的 `<div ref={containerRef}` 内部），在 `</div>` 闭合之前（第 1249 行之前），添加渐隐遮罩：

```tsx
      {isOverflowing && !isEditing && (
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 rounded-b-3xl"
          style={{
            background: isSticky && stickyColorDef
              ? `linear-gradient(to bottom, transparent, ${stickyColorDef.hex ?? 'var(--ol-surface-muted)'})`
              : backgroundColor
                ? `linear-gradient(to bottom, transparent, ${backgroundColor})`
                : 'linear-gradient(to bottom, transparent, var(--ol-surface-muted))',
          }}
        />
      )}
```

- [ ] **Step 3: 禁用 TextNode 容器的滚动**

当前 TextNode 容器有 `overflow-y-auto board-text-scrollbar`（第 1161 行）。修改为：当 `resizable: true` 生效后，超出内容用渐隐遮罩提示而非滚动。将第 1161 行：

```tsx
    "overflow-y-auto board-text-scrollbar",
```

改为：

```tsx
    "overflow-y-hidden",
```

注意：这会让超出内容被截断 + 渐隐遮罩提示，而非滚动。

- [ ] **Step 4: 类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types 2>&1 | tail -20`
Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/nodes/TextNode.tsx
git commit -m "feat(board): add overflow fade mask for TextNode content"
```

---

### Task 5: 添加双击手柄重置高度功能

**Files:**
- Modify: `apps/web/src/components/board/nodes/ResizeHandle.tsx`

- [ ] **Step 1: 在 ResizeHandle 中添加双击处理**

在 `ResizeHandle` 组件中添加 `handleDoubleClick` 回调。双击时将节点高度重置为内容自然高度（通过测量节点内部 `.board-node-content` 的 scrollHeight）。

在 `handlePointerUp` 之后添加：

```tsx
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      e.preventDefault()

      const nodeDiv = e.currentTarget.closest('[data-board-node]') as HTMLElement | null
      if (!nodeDiv) return

      const contentDiv = nodeDiv.querySelector('.board-node-content') as HTMLElement | null
      if (!contentDiv) return

      // 临时移除高度限制来测量自然高度
      const prevHeight = nodeDiv.style.height
      nodeDiv.style.height = 'auto'
      contentDiv.style.overflow = 'visible'
      const naturalHeight = contentDiv.scrollHeight
      nodeDiv.style.height = prevHeight
      contentDiv.style.overflow = ''

      const clampedH = Math.max(minH, Math.min(maxH, naturalHeight))
      const [x, y, w] = element.xywh

      engine.doc.updateElement(element.id, {
        xywh: [x, y, w, clampedH],
      })
      engine.commitHistory()
    },
    [engine, element.id, element.xywh, minH, maxH],
  )
```

然后在 JSX 的 `<div data-resize-handle ...>` 上添加 `onDoubleClick={handleDoubleClick}`。

- [ ] **Step 2: 类型检查**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types 2>&1 | tail -20`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/nodes/ResizeHandle.tsx
git commit -m "feat(board): add double-click to reset node height to content"
```

---

### Task 6: 拖拽期间禁用节点 transition

**Files:**
- Modify: `apps/web/src/components/board/nodes/ResizeHandle.tsx`

- [ ] **Step 1: 在拖拽开始/结束时切换 transition**

在 `handlePointerDown` 中，拖拽开始时禁用节点的 transition：

```tsx
      // 在 dragRef.current = { ... } 之后添加：
      nodeDiv.style.transition = 'none'
```

在 `handlePointerUp` 中，拖拽结束时恢复：

```tsx
      // 在 engine.commitHistory() 之后添加：
      drag.nodeDiv.style.transition = ''
```

还需要处理取消场景。添加 `handleLostPointerCapture`：

```tsx
  const handleLostPointerCapture = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    // 恢复 transition
    drag.nodeDiv.style.transition = ''
    // 恢复原始尺寸（取消操作）
    drag.nodeDiv.style.width = `${drag.startW}px`
    drag.nodeDiv.style.height = `${drag.startH}px`
  }, [])
```

在 JSX 上添加 `onLostPointerCapture={handleLostPointerCapture}`。

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/board/nodes/ResizeHandle.tsx
git commit -m "fix(board): disable transition during resize drag"
```

---

### Task 7: 手动验证

- [ ] **Step 1: 启动开发服务器**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run dev:web`

- [ ] **Step 2: 验证清单**

在浏览器中打开画布，创建或选中一个 TextNode：

1. **手柄显示**：选中 TextNode 时右下角出现三斜线手柄
2. **拖拽宽度**：向右拖拽手柄，节点宽度增加，文字回流
3. **拖拽高度**：向下拖拽手柄，节点高度增加
4. **宽度约束**：拖到极窄/极宽时被 minW/maxW 限制
5. **渐隐遮罩**：缩小高度让文字超出，底部出现渐隐效果
6. **双击重置**：双击手柄，高度恢复为内容自然高度
7. **Undo/Redo**：Ctrl+Z 撤销 resize，Ctrl+Shift+Z 重做
8. **拖拽同步**：resize 过程中手柄始终在右下角，无帧差
9. **zoom 下 resize**：缩放画布到 0.5x 和 2x，resize 行为正常
10. **locked 节点**：锁定节点不显示 resize 手柄
11. **其他节点**：ImageNode、VideoNode 等不显示手柄（`resizable: false`）

- [ ] **Step 3: 最终 Commit**

如果有任何修复，统一提交：

```bash
git add -A
git commit -m "fix(board): polish TextNode resize handle"
```
