# Performance & Collaboration

## 性能优化模式

### 空间索引 (SpatialIndex)

网格哈希加速框选/视口裁剪，cell 大小 500 单位。视口内查询为 O(cells) 而非 O(nodes)。

```typescript
class SpatialIndex {
  private cells = new Map<string, Set<string>>()  // "x,y" → node IDs
  query(rect: CanvasRect): string[]  // 返回矩形区域内的元素 ID
}
```

### 视口裁剪

`CanvasDomLayer` 仅渲染视口内节点，新增节点时确保 `xywh` 正确。

### 批量操作

**始终使用 `doc.transact()`** 包裹多次修改 — 合并为一次订阅通知 + 一次历史快照。
不用 transact 包裹的多次修改会触发多次重渲染和多条历史记录。

### WebGPU 渲染

- 连接线通过 Web Worker + OffscreenCanvas 渲染 (`render/webgpu/`)
- 节点通过 DOM 渲染（`CanvasDomLayer`）
- GPU 节点绘制当前禁用 (`RENDER_GPU_NODES = false`)
- 支持亮/暗主题切换

### 框选节流

框选刷新限制 30 FPS，使用 `requestAnimationFrame` 合并更新。

### 自动高度调整

`use-auto-resize-node.ts` — ResizeObserver + requestAnimationFrame 批处理：
- 变化 < 1px 时跳过更新
- 使用 `measureContainerHeight()` 临时设 `height:auto` 测量 `scrollHeight`

### 视口聚焦防抖

节点聚焦使用 300ms 防抖 (`focusThrottleRef`)，避免连续双击频繁动画。

## Yjs 协作层

### 组件

`BoardCanvasCollab` 组件管理 Yjs + HocuspocusProvider 的生命周期。

### 协作 URL

```
ws://server/board/collab?workspaceId=xxx&projectId=xxx&boardFolderUri=xxx&docId=xxx
```

### 文件结构

```
项目根/
└── .board/                    # boardFolderUri
    ├── .meta                  # board 元数据 (docId)
    ├── index.png              # 缩略图
    ├── board.yjs              # Yjs 持久化（服务端 Hocuspocus）
    └── assets/                # 图片/视频/附件
```

### tRPC 文件操作

`BoardCanvasCollab` 使用 tRPC 进行文件读写：

```typescript
trpc.fs.readFile   // 读取 .meta
trpc.fs.writeFile  // 保存 .meta / 缩略图
trpc.fs.writeBinary // 保存图片资源
trpc.fs.mkdir      // 创建 assets 目录
trpc.fs.list       // 列出已有文件（去重）
```

## Debugging

1. **性能面板**: `BoardPerfOverlay` 组件显示渲染统计
2. **快照检查**: `engine.getSnapshot()` 获取完整状态
3. **空间索引**: `engine.spatialIndex` 查询网格分布
4. **历史栈**: 检查 undo/redo 栈大小（限制 100 条）
5. **协作调试**: 检查 `.board/.meta` 中 `docId` 一致性
6. **视口问题**: `engine.viewport.getState()` 检查 zoom/offset

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 多次 `updateElement` 不用 `transact` | 始终包裹批量修改 |
| 直接修改 element 对象引用 | 通过 `engine.doc.updateElement(id, patch)` |
| 在渲染循环中做昂贵计算 | 使用 `useMemo`/`useCallback` 缓存 |
| ResizeObserver 回调直接更新 engine | 通过 requestAnimationFrame 批处理 |
