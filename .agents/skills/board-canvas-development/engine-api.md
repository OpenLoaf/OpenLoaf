# Engine API Reference

## 核心类关系

```
CanvasEngine (中枢)
  ├── doc: CanvasDoc          — 元素存储 + 事务
  ├── viewport: ViewportController — 缩放/平移/坐标转换
  ├── selection: SelectionManager  — 选区状态
  ├── nodes: NodeRegistry     — 节点定义查询
  └── tools: ToolManager      — 工具注册 + 事件路由
```

## 节点操作

```typescript
engine.addNodeElement(type, props, xywh)     // 添加节点，返回 id
engine.doc.updateElement(id, patch)           // 更新元素（xywh/props/meta 等）
engine.doc.updateNodeProps(id, propsPatch)    // 仅更新 props
engine.doc.removeElement(id)                  // 删除元素
engine.doc.getElementById(id)                 // 获取元素
engine.doc.getElements()                      // 所有元素（有序）
```

## 连接器操作

```typescript
engine.addConnectorElement({
  source: { elementId: 'node-a' },           // 或 { point: [x, y] }
  target: { elementId: 'node-b', anchorId?: 'top' },
  style?: 'curve',                            // straight | elbow | curve | hand | fly
  color?: '#333',
  dashed?: false,
})
```

## 批量操作

**始终使用 `transact()` 包裹多次修改** — 合并为一次订阅通知 + 一次历史快照：

```typescript
engine.doc.transact(() => {
  engine.doc.updateElement(id1, { xywh: [10, 20, 200, 100] })
  engine.doc.updateElement(id2, { props: { title: 'new' } })
})
```

## 选区

```typescript
engine.selection.getSelectedIds()    // 获取选中 ID 列表
engine.selection.set([id1, id2])     // 设置选区
engine.selection.clear()             // 清空选区
engine.selection.toggle(id)          // 切换选中
```

## 视口 & 坐标转换

```typescript
engine.screenToWorld(screenPoint)    // 屏幕坐标 → 世界坐标
engine.worldToScreen(worldPoint)     // 世界坐标 → 屏幕坐标
engine.viewport.getState()           // { zoom, offset: [x,y], size: [w,h] }
engine.fitToElements()               // 自适应缩放到所有元素
engine.focusViewportToRect(rect, { padding, durationMs })  // 动画聚焦到区域
```

## 历史记录

```typescript
engine.undo()
engine.redo()
engine.pushHistory()                 // 手动推送历史快照
// 历史栈限制 100 条 (HISTORY_MAX_SIZE)
```

## 状态查询

```typescript
engine.getSnapshot()                 // 完整快照 (CanvasSnapshot)
engine.isLocked()                    // 画布是否锁定
engine.getConnectorStyle()           // 当前连线样式
engine.getPendingInsert()            // 待放置的插入请求
engine.getConnectorDraft()           // 正在拖拽的连线草稿
engine.getConnectorDrop()            // 连线释放待创建节点
engine.pickElementAt(worldPoint)     // 命中测试：查找指定位置的元素
```

## React Context & Hooks

```typescript
// 获取 engine 实例
const engine = useBoardEngine()

// 获取完整上下文
const { engine, actions, fileContext } = useBoardContext()

// BoardActions — 跨层 UI 操作
actions.openImagePreview({ originalSrc, previewSrc, fileName })
actions.closeImagePreview()

// BoardFileContext — 文件作用域
// { workspaceId, projectId, rootUri, boardId, boardFolderUri }
```

## 状态订阅（React 集成）

```typescript
// useBoardSnapshot hook — 自动订阅引擎变更
const snapshot = useBoardSnapshot(engine)
// snapshot.elements          — 有序元素列表
// snapshot.selectedIds       — 选中 ID
// snapshot.viewport          — 视口状态
// snapshot.editingNodeId     — 编辑中的节点
// snapshot.canUndo/canRedo   — 历史可用性
// snapshot.activeToolId      — 当前工具
// snapshot.connectorDraft    — 拖拽连线
// snapshot.alignmentGuides   — 对齐辅助线

// 手动订阅（非 React 场景）
const unsub = engine.subscribe(() => engine.getSnapshot())
```

## 核心类型速查

```typescript
type CanvasPoint = [number, number]
type CanvasRect = { x, y, w, h }

type CanvasNodeElement<P> = {
  kind: 'node', id, type, xywh: [x, y, w, h],
  props: P, rotate?, zIndex?, opacity?, locked?, meta?
}

type CanvasConnectorElement = {
  kind: 'connector', id, xywh,
  source: CanvasConnectorEnd, target: CanvasConnectorEnd,
  style?, color?, dashed?
}

type CanvasConnectorEnd =
  | { elementId: string, anchorId?: string }
  | { point: CanvasPoint }

type CanvasViewportState = { zoom, offset: CanvasPoint, size: CanvasPoint }
```
