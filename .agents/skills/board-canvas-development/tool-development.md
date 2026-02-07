# Tool Development

## CanvasTool 接口

```typescript
// tools/ToolTypes.ts
type ToolContext = {
  engine: CanvasEngine       // 引擎实例
  event: PointerEvent        // 原始事件
  screenPoint: CanvasPoint   // 屏幕坐标
  worldPoint: CanvasPoint    // 世界坐标（已转换）
}

type CanvasTool = {
  id: string
  onPointerDown?: (ctx: ToolContext) => void
  onPointerMove?: (ctx: ToolContext) => void
  onPointerUp?: (ctx: ToolContext) => void
  onKeyDown?: (event: KeyboardEvent, engine: CanvasEngine) => void
}
```

## 添加新工具：3 步

### Step 1: 实现 CanvasTool

```typescript
// tools/MyTool.ts
import type { CanvasTool, ToolContext } from './ToolTypes'

export class MyTool implements CanvasTool {
  id = 'my-tool'

  onPointerDown(ctx: ToolContext) {
    const { engine, worldPoint, event } = ctx
    // worldPoint 已经过坐标转换，直接用于画布计算
  }

  onPointerMove(ctx: ToolContext) { /* 拖拽逻辑 */ }
  onPointerUp(ctx: ToolContext) { /* 完成交互 */ }
  onKeyDown(event: KeyboardEvent, engine: CanvasEngine) { /* 快捷键 */ }
}
```

### Step 2: 注册到 CanvasEngine

在 `CanvasEngine` 构造函数中：

```typescript
this.tools.register(new MyTool())
```

### Step 3: 添加快捷键（可选）

在 `ToolManager.ts` 的 `TOOL_SHORTCUTS` 中：

```typescript
const TOOL_SHORTCUTS: Record<string, string> = {
  a: 'select', w: 'hand', p: 'pen', k: 'highlighter', e: 'eraser',
  m: 'my-tool',  // 新增
}
```

## ToolManager 事件流

```
PointerEvent (浏览器)
  ↓
ToolManager.handlePointerDown(event)
  ├─ isBoardUiTarget(event.target) → 跳过（UI 元素）
  ├─ 坐标转换: clientX/Y → screenPoint → worldPoint
  ├─ pendingInsert 检查 → 放置节点并返回
  ├─ 中键(button=1) → 临时 HandTool
  └─ getActiveTool().onPointerDown(ctx)
```

**关键行为**:
- **中键特例**: 按下自动切入 HandTool，松开恢复原工具
- **Pointer Capture**: 拖拽时捕获指针，防止丢失
- **UI 过滤**: `data-board-node` 元素内的事件不跳过
- **锁定检查**: 画布锁定时阻止画笔/橡皮擦工具

## 全局快捷键

| 快捷键 | 功能 | 处理位置 |
|--------|------|----------|
| A | 选择工具 | ToolManager.TOOL_SHORTCUTS |
| W | 拖拽工具 | ToolManager.TOOL_SHORTCUTS |
| P | 钢笔 | ToolManager.TOOL_SHORTCUTS |
| K | 荧光笔 | ToolManager.TOOL_SHORTCUTS |
| E | 橡皮擦 | ToolManager.TOOL_SHORTCUTS |
| F | 适应全部元素 | ToolManager.handleViewShortcut |
| L | 锁定/解锁画布 | ToolManager.handleLockShortcut |
| Ctrl/Cmd+Shift+L | 自动布局 | ToolManager.handleAutoLayoutShortcut |
| Escape | 取消插入/连线/选区 | ToolManager.handleKeyDown |

**注意**: 输入控件 (`input`/`textarea`/`contenteditable`) 和组合键 (`meta`/`ctrl`/`alt`) 场景下不响应工具快捷键。

## 现有工具参考

| 工具 | 快捷键 | 复杂度 | 用途 |
|------|--------|--------|------|
| `SelectTool` | A | ~830行 | 选择/移动/缩放/旋转/连线（最复杂） |
| `HandTool` | W | 简单 | 拖拽平移视口 |
| `PenTool` | P | 中等 | 钢笔画笔（pressure-sensitive） |
| `HighlighterTool` | K | 中等 | 荧光笔 |
| `EraserTool` | E | 简单 | 橡皮擦（清除笔画） |

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 使用 `event.clientX/Y` 计算位置 | 使用 `ctx.worldPoint`（已坐标转换） |
| 不检查 `engine.isLocked()` | 锁定状态下应阻止编辑操作 |
| 忘记 pointer capture | 拖拽操作需要 `setPointerCapture` 防止丢失 |
| 在输入框中响应快捷键 | ToolManager 已处理，但自定义 onKeyDown 需自行检查 |
