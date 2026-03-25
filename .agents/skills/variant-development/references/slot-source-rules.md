# Slot Source 规则速查

## 三种 Source

| Source | 含义 | UI 行为 | 持久化 |
|--------|------|--------|--------|
| `pool`（默认） | 从上游连线引用池分配 | InputSlotBar 渲染为可交互卡片 | slotAssignment[key] |
| `self` | 绑定当前节点自身资源 | 不渲染（hidden），自动填充 | 不持久化（始终最新） |
| `paint` | 画布绘制遮罩 | 遮罩编辑器 | paint:asset/path |

## self 的行为

- 存在 `source: 'self'` 的 slot → nodeResource **不进入** pool → pool slot 不会意外获得节点自身图
- self slot 的值由面板通过 `selfResource` prop 传给 InputSlotBar
- InputSlotBar 在 `onAssignmentChange` 回调中补充 self slot 的 resolved input
- 序列化时 `serializeForGenerate` 从 `formState.selfResource` 读取

## pool 的行为

- 从上游连线节点收集同类型媒体（image/video/audio/text）
- `restoreOrAssignV3` 按声明顺序自动分配，required（min≥1）优先
- 用户可手动拖拽调整分配
- 支持手动上传（`allowUpload` 默认 true）

## paint 的行为

- 仅用于遮罩绘制（mask slot）
- 配合 `maskPaint: true` 和可选的 `maskRequired: true`
- 画布上方显示画笔工具
- 结果存为图片路径

## isApplicable 与 source 的对应关系

| 需要 | isApplicable | slot source |
|------|-------------|------------|
| 节点自身图片 | `ctx.nodeHasImage` | `source: 'self'` |
| 节点自身视频 | `ctx.nodeHasVideo` | `source: 'self'` |
| 节点自身音频 | `ctx.nodeHasAudio` | `source: 'self'` |
| 上游有图片 | `ctx.hasImage` | `source: 'pool'` |
| 上游有音频 | `ctx.hasAudio` | `source: 'pool'` |
| 无条件 | `() => true` | `source: 'pool'` |

**铁律**：`source: 'self'` + `min: 1` → 必须用 `nodeHasXxx`，否则 variant 可见但 self slot 无法填充。
