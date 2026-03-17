
## 性能规则

- **空间索引**：`SpatialIndex` 用网格哈希加速框选与视口裁剪；大量节点场景优先检查索引是否同步更新。
- **视口裁剪**：`CanvasDomLayer` 只渲染视口内节点；新增节点后若 `xywh` 异常，通常会直接表现为“不显示”。
- **批量操作**：多次连续修改必须包在 `doc.transact()` 中，避免重复渲染和历史噪声。
- **框选节流**：框选刷新通过 `requestAnimationFrame` 合并到约 30 FPS。
- **自动高度**：`use-auto-resize-node.ts` 用 `ResizeObserver + requestAnimationFrame` 批处理；不要在回调里直接连续写 engine。
- **聚焦防抖**：节点聚焦带有防抖，避免双击或快速切换导致重复动画。
- **渲染分层**：连接线走 Worker/OffscreenCanvas，节点仍由 DOM 层负责。
- **Pixi 资源释放**：涉及 `AlphaFilter` / offscreen texture 的图层，必须先解绑或停掉 ticker，再释放 filter / graphics / app；不要在当前渲染帧内直接销毁仍可能被 Pixi 指令引用的资源。

## 协作层

- `BoardCanvasCollab` 负责 Yjs 和 HocuspocusProvider 生命周期。
- 协作连接参数当前基于：
  - `projectId`
  - `boardFolderUri`
  - `docId`
- 协作文档不再依赖历史工作空间参数。
- `.board/` 目录通常承载：
  - `.meta`
  - `index.png`
  - `board.yjs`
  - `assets/`
- 协作侧文件读写仍通过 tRPC 文件接口完成，重点关注 `.meta` 和资源目录是否一致。

## Debugging

1. 先看 `BoardPerfOverlay`，确认渲染数量和帧率是否异常。
2. 用 `engine.getSnapshot()` 检查状态是否已经写入引擎。
3. 用 `engine.spatialIndex` 验证节点是否进入正确网格。
4. 检查 undo/redo 栈，确认是否出现遗漏事务或重复事务。
5. 协作问题优先核对 `.board/.meta` 的 `docId` 是否一致。
6. 视口问题直接查看 `engine.viewport.getState()`。
7. 如果报错栈落在 `BindGroup.setResource` / `FilterSystem.pop`，优先检查高亮笔 `AlphaFilter` 是否在同一帧被提前销毁，以及 Pixi Application 是否在停表前就开始清理图层资源。

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 多次更新不走 `transact()` | 用一次事务包裹相关变更 |
| 直接修改 element 对象 | 统一通过 `engine.doc` API 修改 |
| 在渲染循环里做重计算 | 让索引、快照或 hook 层承担缓存 |
| 在 ResizeObserver 回调里直接连写引擎 | 用 `requestAnimationFrame` 批处理 |
