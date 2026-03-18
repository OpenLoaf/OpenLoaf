---
name: canvas-ops
description: >
  画布/白板/图表操作——创建、查看、整理、删除画布。当用户提到画布、白板、图表、
  流程图、思维导图、可视化布局、节点、头脑风暴、钉板，或者"我想画个图"、
  "帮我可视化一下"、"做个流程图"、"加个方框"、"把 A 连到 B"、"加个备注"、
  "draw a diagram"、"organize my ideas visually"、"make a chart of"等任何与
  视觉化排布相关的意图时激活。
---

# 画布操作技能

你有两个工具：`board-query`（只读，无需审批）和 `board-mutate`（写入，需审批）。

## 我该用哪个？

按你的目的选择：

```
想看有哪些画布？              → board-query (mode: list)
想按项目筛选画布？            → board-query (mode: list, 带 projectId)
想按关键词搜索画布？          → board-query (mode: list, 带 search)
想找未关联项目的孤立画布？    → board-query (mode: list, 带 unboundOnly: true)
想看某个画布的详情和节点？    → board-query (mode: get, 带 boardId)
想新建一个画布？              → board-mutate (action: create)
想修改画布标题/置顶/归属？    → board-mutate (action: update)
想删除画布？                  → board-mutate (action: delete)  ← 默认用这个
想彻底永久删除？              → board-mutate (action: hard-delete)
想复制一个画布？              → board-mutate (action: duplicate)
想清理所有孤立画布？          → board-mutate (action: clear-unbound)
```

## 画布内节点操作

画布内的节点编辑（添加节点、连线、修改内容）通过子 Agent 或画布编辑工具完成，不是本技能直接执行的。你需要了解的是：

- `board-query { mode: "get" }` 返回画布的**完整节点和连线信息**，用于理解画布当前内容
- 用户说"加个方框"、"把 A 连到 B"、"修改节点内容"——这些是节点级操作，由画布编辑 Agent 处理
- 你的职责是**管理画布本身**（创建、删除、归属、复制），而非操作画布内的元素

## 跨技能协作

复杂场景需要多个技能配合：

- 用户说"创建一个项目架构流程图"→ 先用 `project-query` 了解项目结构，再 `board-mutate { action: "create" }` 创建画布，最后由画布编辑 Agent 根据项目结构添加节点和连线
- 用户说"把任务看板可视化"→ 先用 `task-status` 获取任务列表，再创建画布并交由编辑 Agent 布局

## 核心工作流

### 流程一：创建新画布

```
1. 确认用户想要的画布标题和所属项目
2. board-mutate (action: create, title: "...")   → 拿到返回的 boardId
3. 如需关联项目，create 时带 projectId
```

### 流程二：整理画布

```
1. board-query (mode: list)                      → 获取所有画布
2. 分析哪些画布未关联项目、哪些可能重复
3. 向用户汇报现状并提出整理建议
4. board-mutate (action: update, projectId: ...) → 把孤立画布归入项目
5. board-mutate (action: delete)                 → 清理不需要的画布
```

### 流程三：查找并查看画布

```
1. board-query (mode: list, search: "关键词")    → 搜索匹配画布
2. board-query (mode: get, boardId: "...")        → 获取画布详情（含节点和连线）
3. 向用户展示画布内容摘要
```

## 关键决策——以及为什么

### boardId 从哪来？

优先检查 `pageContext.boardId`（用户正在看的画布）。如果没有上下文，先用 `board-query (mode: list)` 搜索。**永远先确认 boardId 正确。**

在错误的画布上操作会**静默破坏数据**——具体表现：节点被添加到错误的画布、原本画布的连线关系被污染、用户看到的画布与实际修改的不一致。这种损坏不会报错，用户可能在很久之后才发现内容错乱，且由于操作已被保存，**无法通过撤销恢复**（只能从备份或 hard-delete 后重建）。所以"先确认 boardId"不是流程洁癖，而是防止不可逆的数据混乱。

### delete vs hard-delete

默认用 delete（软删除，可恢复）。用户经常后悔。只有用户明确说"彻底删除"、"永久删除"时才用 hard-delete。

### clear-unbound 要极度谨慎

它会一次性删除所有未关联项目的画布。操作前**必须**先 `board-query (mode: list, unboundOnly: true)` 让用户确认列表，避免误删有价值的独立画布。

### 删除前必须确认

任何 delete、hard-delete、clear-unbound 操作前，都应向用户展示即将影响的画布列表。这与发邮件前确认收件人是同一原则——不可逆操作需要人类把关。
