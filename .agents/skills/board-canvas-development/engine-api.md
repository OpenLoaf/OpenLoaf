
## 核心类关系

- `CanvasEngine` 是画布运行时入口，聚合 `doc`、`history`、`viewport`、`spatialIndex`、`selection` 等状态。
- `engine.doc` 负责节点、连接器和事务级更新。
- React 层通过 `BoardProvider` 注入三类上下文：
  - `engine`
  - `actions`
  - `fileContext`

## 节点与连接器修改规则

- 单次节点修改统一走 `engine.doc` 暴露的 API，不要直接改 element 引用。
- 多次相关修改必须包在 `transact()` 中，避免产生多次订阅通知和多条历史记录。
- 新增节点时要同时保证：
  - `type` 正确
  - `xywh` 合法
  - `props` 结构与节点组件约定一致
- 新增连接器时要同时校验 `source.elementId` 与 `target.elementId`，避免悬空连线。

## 文件上下文

- 纯类型定义位于 `apps/web/src/components/board/board-contracts.ts`，`BoardProvider` 仅负责注入和转发，不再作为 `BoardFileContext` 的单一声明源。
- `BoardFileContext` 当前字段为：
  - `projectId?`
  - `rootUri?`
  - `boardId?`
  - `boardFolderUri?`
- 文档和媒体节点涉及文件解析时，应优先从 `fileContext` 取值，不要再假设存在历史工作空间字段。

## 跨层 UI 操作

- 图片预览、关闭预览等跨层 UI 行为统一通过 `actions` 暴露。
- `actions` 的职责是连接节点交互与外层 UI，不应把这类副作用塞回 engine 本身。

## React 集成

- `useBoardContext()` 用于读取 `engine`、`actions`、`fileContext`。
- `useBoardSnapshot()` 负责把引擎状态转成适合 React 渲染的快照。
- 节点组件应只订阅自己需要的状态切片，避免把全量快照一路下传。

## 检查清单

- 批量修改是否使用了 `transact()`。
- 是否通过 `engine.doc` 而不是直接 mutate 内存对象。
- 文件相关节点是否正确透传 `projectId/rootUri/boardFolderUri`。
- 跨层预览、弹层、外部 UI 行为是否走 `actions`。
