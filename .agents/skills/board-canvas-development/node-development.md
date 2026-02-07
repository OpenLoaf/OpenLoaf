# Node Development

## 添加新节点：4 步流程

### Step 1: 定义 Props 类型 + Zod Schema

```typescript
// nodes/MyNode.tsx
import { z } from 'zod'
import type { CanvasNodeDefinition, CanvasNodeViewProps } from '../engine/types'

export type MyNodeProps = {
  title: string
  color: string
}

const myNodeSchema = z.object({
  title: z.string(),
  color: z.string(),
})
```

### Step 2: 创建 View 组件

```typescript
function MyNodeView({ element, selected, editing, onSelect, onUpdate }: CanvasNodeViewProps<MyNodeProps>) {
  return (
    <NodeFrame element={element} selected={selected}>
      <div className="p-2">
        <h3 style={{ color: element.props.color }}>{element.props.title}</h3>
      </div>
    </NodeFrame>
  )
}
```

**CanvasNodeViewProps 字段**:
- `element` — 完整节点数据 (`id`, `xywh`, `props`, `rotate`, `opacity` 等)
- `selected` — 是否被选中
- `editing` — 是否编辑模式（双击进入）
- `onSelect()` — 请求选中
- `onUpdate(patch)` — 更新 props（自动写入 Engine + 历史记录）

### Step 3: 导出 NodeDefinition

```typescript
export const MyNodeDefinition: CanvasNodeDefinition<MyNodeProps> = {
  type: 'my-node',                          // 唯一类型标识
  schema: myNodeSchema,                     // Zod 验证
  defaultProps: { title: 'New', color: '#000' },
  view: MyNodeView,                         // React 渲染组件

  // --- 以下全部可选 ---

  measure: (props, ctx) => ({ w: 200, h: 100 }),  // 自动尺寸

  anchors: (props, bounds) => [              // 连线锚点
    { id: 'top', point: [bounds.x + bounds.w / 2, bounds.y] },
    { id: 'bottom', point: [bounds.x + bounds.w / 2, bounds.y + bounds.h] },
    { id: 'left', point: [bounds.x, bounds.y + bounds.h / 2] },
    { id: 'right', point: [bounds.x + bounds.w, bounds.y + bounds.h / 2] },
  ],

  toolbar: (ctx) => [{                      // 选中时工具栏按钮
    id: 'action', label: 'Action', icon: <Icon />,
    onSelect: () => ctx.updateNodeProps({ color: '#f00' }),
    panel?: ReactNode,                       // 可选二级面板
  }],

  capabilities: {                            // 能力标记
    resizable: true,
    resizeMode: 'free',                      // 'free' | 'uniform' | 'ratio-range'
    rotatable: false,
    connectable: 'auto',                     // 'auto' | 'anchors' | 'none'
    minSize: { w: 100, h: 60 },
    maxSize: { w: 800, h: 600 },
  },

  connectorTemplates: (element) => [{        // 从锚点拖出的模板
    id: 'child', label: 'Child', description: '...',
    size: [200, 100],
    createNode: ({ sourceElementId }) => ({
      type: 'my-node',
      props: { title: 'Child', color: element.props.color },
    }),
  }],
}
```

### Step 4: 注册到 board-nodes.ts

```typescript
// core/board-nodes.ts
import { MyNodeDefinition } from '../nodes/MyNode'

export const BOARD_NODE_DEFINITIONS = [
  // ... existing
  MyNodeDefinition,
]
```

## CanvasNodeDefinition 完整 API

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `type` | `string` | 是 | 唯一类型标识，不可与已有冲突 |
| `schema` | `ZodType<P>` | 否 | Props 运行时验证 |
| `defaultProps` | `P` | 是 | 新建节点的默认 props |
| `view` | `ComponentType<CanvasNodeViewProps<P>>` | 是 | 渲染组件 |
| `measure` | `(props, ctx) => { w, h }` | 否 | 自动尺寸计算 |
| `anchors` | `(props, bounds) => CanvasAnchorDefinition[]` | 否 | 连线锚点（世界坐标） |
| `toolbar` | `(ctx: CanvasToolbarContext<P>) => CanvasToolbarItem[]` | 否 | 选中时工具栏 |
| `capabilities` | `CanvasNodeCapabilities` | 否 | 缩放/旋转/连接能力 |
| `connectorTemplates` | `(element) => CanvasConnectorTemplateDefinition[]` | 否 | 锚点拖出模板 |

## CanvasToolbarContext

```typescript
type CanvasToolbarContext<P> = {
  element: CanvasNodeElement<P>          // 目标节点
  selected: boolean
  fileContext?: BoardFileContext          // 文件作用域
  openInspector: (elementId) => void     // 打开检查面板
  updateNodeProps: (patch) => void       // 更新 props + 历史
  ungroupSelection: () => void           // 取消分组
  uniformGroupSize: (groupId) => void    // 统一子节点尺寸
  layoutGroup: (groupId, direction?) => void  // 自动布局
  getGroupLayoutAxis: (groupId) => 'row' | 'column' | 'mixed'
}
```

## 现有节点参考

| 节点 | type | 特点 | 文件 |
|------|------|------|------|
| TextNode | `text` | 富文本编辑、auto-resize、思维导图子节点 | `TextNode.tsx` (~1000行) |
| ImageNode | `image` | 预览/原图分离、board-scoped URI、转码 | `ImageNode.tsx` |
| VideoNode | `video` | 视频播放 + 缩略图 | `VideoNode.tsx` |
| LinkNode | `link` | URL 预览卡片、双击在 stack 中打开 | `LinkNode.tsx` |
| GroupNode | `group` / `image_group` | 子节点分组、自动布局 | `GroupNode.tsx` |
| StrokeNode | `stroke` | 手绘笔画（点 + 压感） | `StrokeNode.tsx` |
| LoadingNode | `loading` | 异步任务轮询占位 | `LoadingNode.tsx` |
| ImageGenerateNode | `image_generate` | AI 图片生成表单 | `imageGenerate/` |
| VideoGenerateNode | `video_generate` | AI 视频生成表单 | `videoGenerate/` |
| ImagePromptGenerateNode | `image_prompt_generate` | 图生文 SSE | `imagePromptGenerate/` |

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 忘记在 `board-nodes.ts` 注册 | 必须添加到 `BOARD_NODE_DEFINITIONS` |
| type 与已有冲突 | `NodeRegistry.register()` 会抛异常 |
| 锚点返回屏幕坐标 | 锚点始终使用**世界坐标** |
| View 中直接修改 engine 状态 | 使用 `onUpdate(patch)` 或通过 `useBoardEngine()` |
| 不包裹 NodeFrame | 缺少选中边框、拖拽、右键菜单等基础交互 |
