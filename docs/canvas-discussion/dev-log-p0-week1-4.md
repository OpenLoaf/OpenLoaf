# Canvas P0 开发日志

> 日期：2026-03-19
> 分支：`feature/canvas-redesign`
> 执行者：Claude Opus 4.6 + Agent Team

---

## 一、总览

本次会话完成了 Canvas P0 计划中 **Week 1（全部）、Week 2（全部）、Week 4（核心）** 的前端实现，共 **10 个 commit**，**2200+ 行新增代码**，**20+ 个文件变更**，**4 个新组件 + 2 个新工具函数 + 2 个新 hook**。

### 进度对照

| 周 | 计划内容 | 状态 | 完成度 |
|----|---------|------|--------|
| Week 0 | Phase 0 清理 | ✅ 之前已完成 | 100% |
| Week 1 | 节点类型 + 工具栏 + 两态切换 | ✅ 完成 | 100% |
| Week 2 | 节点内嵌参数面板 | ✅ 完成 | 100% |
| Week 3 | AI 生成集成 + 连线数据流 | ⏳ 待做 | 0% |
| Week 4 | 浮动工具栏 + 一键派生 | ✅ 核心完成 | 80% |
| Week 5 | 分组 + 预览 + 下载 + 空状态 | ⏳ 待做 | 0% |
| Week 6 | 联调 + Buffer | ⏳ 待做 | 0% |

---

## 二、Commit 清单

| # | Hash | Message | 类型 |
|---|------|---------|------|
| 1 | `44710620` | feat(board): add LeftToolbar, BottomBar, node props extension + two-state infrastructure (P0 Week 1) | 功能 |
| 2 | `948b1747` | chore: minor cleanups in settings, publish script, and fs router | 清理 |
| 3 | `787a7d09` | feat(board): add ImageAiPanel, VideoAiPanel, upstream data resolution (P0 Week 2) | 功能 |
| 4 | `7feae605` | fix(board): connect useUpstreamData to panels + restore ImageNode toolbar | 修复 |
| 5 | `c1ec5f49` | fix(board): keep AI panel at fixed screen size by counter-scaling canvas zoom | 修复 |
| 6 | `f85a99df` | fix(board): center AI panel horizontally under node | 修复 |
| 7 | `a7e180dd` | fix(board): sync AI panel scale in real-time during zoom via subscribeView | 修复 |
| 8 | `0501cd72` | fix(board): render AI panels above stroke layer via Portal overlay | 修复 |
| 9 | `3875a8c9` | feat(board): add AI toolbar buttons, deriveNode, UpscalePanel (P0 Week 2/4) | 功能 |

---

## 三、Week 1 交付物

### 3.1 类型扩展（board-contracts.ts + 各节点文件）

- 新增 `NodeOrigin` 类型：`'user' | 'upload' | 'ai-generate' | 'paste'`
- 新增 `AiGenerateConfig` 类型：modelId, prompt, negativePrompt, style, aspectRatio, inputNodeIds, taskId, generatedAt
- `ImageNodeProps` / `VideoNodeProps` / `AudioNodeProps` 添加 `origin?` + `aiConfig?`
- `GroupNodeProps` 添加 `groupRole: 'manual' | 'storyboard'` + `title?`
- `LoadingNodeProps` 的 `LoadingTaskType` 添加 `'upscale'`
- `TextNodeProps` 添加 `origin?`
- `CanvasNodeDefinition` 添加 `inlinePanel?: { width, height }`
- `CanvasNodeViewProps` 添加 `expanded?: boolean`
- `CanvasSnapshot` 添加 `expandedNodeId: string | null`
- 所有节点 **Zod schema** 同步更新

### 3.2 左侧工具栏（LeftToolbar.tsx — 新建）

5 按钮垂直布局，48px 宽：
- Select (V) / Hand (H) / Text (T) / Insert (+) / Connector (C)
- Text 按钮 hover 弹出子面板（plain / sticky），从右侧弹出
- Insert 按钮 hover 弹出子面板（图片/视频/音频/文件/链接）
- 自定义 `SidePanel` + `SidePanelItem` 组件（不复用旧的 `HoverPanel`，避免定位冲突）

### 3.3 底部功能栏（BottomBar.tsx — 新建）

- AI 创建按钮：AI 图片（蓝）、AI 视频（紫）、AI 音频（绿）
- Undo / Redo 按钮
- 视口控制：缩小 / 百分比 / 放大 / 适应视图
- 缩放支持长按连续操作

### 3.4 节点两态切换基础设施

- `CanvasEngine` 添加 `expandedNodeId` 状态 + `setExpandedNodeId()`
- `DomNodeLayer` 节点容器支持 `expanded` 态：`overflow-visible` + z-index +9999
- `BoardCanvasRender` 中 `useEffect` 监听选区变化，自动展开有 `inlinePanel` 的节点
- 同时只有一个节点可展开，切换/取消选中自动收起

---

## 四、Week 2 交付物

### 4.1 图片生成参数面板（ImageAiPanel.tsx — 新建）

- 文生图 / 图生图 tab 切换
- 提示词 textarea
- 模型选择下拉（硬编码 4 个选项，后续接入真实模型列表）
- 比例按钮组（1:1 / 16:9 / 9:16 / 4:3）
- 分辨率按钮组（1K / 2K / 4K）
- 高级设置折叠区
- 生成按钮（disabled 直到输入 prompt）
- 蓝色主题配色

### 4.2 视频生成参数面板（VideoAiPanel.tsx — 新建）

- 提示词 textarea
- 首帧图片区域（有上游图片时显示缩略图，否则上传按钮）
- 模型选择下拉
- 比例按钮组（1:1 / 16:9 / 9:16 / 4:3）
- 时长按钮组（5s / 10s）
- 生成按钮
- 紫色主题配色

### 4.3 高清放大面板（UpscalePanel.tsx — 新建）

- 放大倍数选择：2x / 4x
- 模型选择下拉
- 绿色主题配色

### 4.4 上游数据解析（upstream-data.ts — 新建）

- `resolveUpstreamData(doc, nodeId)` — 遍历连线提取上游节点内容
- `serializePlateValueToText()` — Plate.js 富文本 → 纯文本序列化
- 支持 text 节点（提取文本）和 image 节点（提取 previewSrc）

### 4.5 useUpstreamData Hook（新建）

- 200ms debounce
- 监听 engine 变更自动重算
- `nodeId` 为 null 时不订阅（性能优化）
- 已接入 ImageNodeView 和 VideoNodeView

### 4.6 面板渲染架构

**渲染层级（从底到顶）：**
```
1. PixiJS 底层    — 连线
2. DomNodeLayer   — 节点 DOM 组件
3. PixiJS 上层    — 笔画 / 选区框 / 对齐线
4. PanelOverlay   — AI 参数面板 Portal（新增）
```

- 面板通过 `createPortal` 渲染到第 4 层 `PanelOverlayLayer`，避免被笔画层遮挡
- `PanelOverlayLayer` 与 DomNodeLayer 共享相同 viewport transform（通过 `subscribeView` 同步）
- 面板使用 `scale(1/zoom)` + `subscribeView` 实时保持固定屏幕大小
- `translateX(-50%)` 相对节点水平居中
- 缩放过程中通过直接 DOM 操作同步（不经过 React 渲染，零延迟）

### 4.7 SelectionOutline 适配

- 节点展开时隐藏 resize 手柄（`expandedNodeId === element.id` → `allowHandles = false`）

---

## 五、Week 4 交付物

### 5.1 浮动工具栏 AI 按钮

| 节点类型 | 新增按钮 |
|---------|---------|
| Text | [✨ 生成图片] [🎬 生成视频] |
| Image (upload) | [🎬 生视频] [✨ 高清] |
| Image (ai-generate) | [🎬 生视频] [✨ 高清] [🔄 重新生成] |
| Video | [✨ 高清放大] |

所有 AI 按钮目前 `onSelect: () => {}`，待 Week 3 接入真实生成逻辑。

### 5.2 一键派生（derive-node.ts — 新建）

`deriveNode(options)` 函数：
1. 获取源节点 xywh
2. 计算新节点位置（右侧，智能堆叠）— 复用 `resolveDirectionalStackPlacement`
3. 创建目标节点（`origin: 'ai-generate'`）
4. 创建连线（source → target）
5. 选中新节点（触发 expand，打开参数面板）

---

## 六、审查结果汇总

### 6.1 审查执行

共启动 **8 个审查 Agent**（跨 2 轮），覆盖：
- 代码架构审查（类型安全/向后兼容/内存泄漏/可访问性/i18n）
- Chrome MCP UI 交互测试（2 轮）
- P0 计划对照审查
- 竞品 LibLib 对比分析
- 代码集成审查（Week 2 三个 Agent 的代码对接）

### 6.2 发现并修复的问题

| 问题 | 严重度 | 修复 |
|------|--------|------|
| Zod schema 未同步 | P0 | ✅ 所有节点 schema 已更新 |
| ImageNodeProps 重复定义 | P0 | ✅ 已同步 |
| TextNodeProps 缺少 origin | P1 | ✅ 已添加 |
| `upscale` 未纳入 LoadingNode canRun | P0 | ✅ 已添加 |
| LeftToolbar hoverTimerRef 泄漏 | P0 | ✅ 添加 cleanup |
| BottomBar zoom hold 泄漏 | P1 | ✅ 添加 cleanup |
| BottomBar 死代码 onAutoLayout | P1 | ✅ 移除 |
| auto-expand effect 过度执行 | P1 | ✅ 移除 snapshot.elements 依赖 |
| useUpstreamData 未被面板使用 | P0 | ✅ 已接入 |
| ImageNode toolbar 返回空数组 | P0 | ✅ 已恢复 |
| HoverPanel 定位冲突（底部→右侧） | P0 | ✅ 重写为 SidePanel |
| BottomBar 文字换行 | P1 | ✅ 添加 w-auto whitespace-nowrap |
| 面板不随缩放保持大小 | P0 | ✅ scale(1/zoom) + subscribeView |
| 面板未居中 | P1 | ✅ translateX(-50%) |
| 缩放同步延迟（仅停后更新） | P0 | ✅ subscribeView 直接 DOM 操作 |
| 笔画层遮挡面板 | P0 | ✅ Portal 到第 4 层 PanelOverlay |

### 6.3 竞品对比评级

| 维度 | vs LibLib | 说明 |
|------|-----------|------|
| 左侧工具栏 | 🟡 有差距 | 缺素材库/工具箱入口 |
| 底部栏 | 🟢 有优势 | AI 按钮前置降低发现成本 |
| 节点系统 | 🟡 有差距 | AiGenerateConfig 字段不够丰富 |
| 展开/编辑态 | 🟡 → 🟢 改善中 | 面板已实现，待接入真实 AI 生成 |
| AI 生成工作流 | 🔴 差距大 | 前端 UI 就绪，但未接通后端 |

---

## 七、新增文件清单

| 文件 | 说明 |
|------|------|
| `toolbar/LeftToolbar.tsx` | 左侧 5 按钮垂直工具栏 |
| `toolbar/BottomBar.tsx` | 底部 AI 按钮 + 视口控制栏 |
| `panels/ImageAiPanel.tsx` | 图片 AI 生成参数面板 |
| `panels/VideoAiPanel.tsx` | 视频 AI 生成参数面板 |
| `panels/UpscalePanel.tsx` | 高清放大参数面板 |
| `engine/upstream-data.ts` | 上游连线数据解析工具 |
| `hooks/useUpstreamData.ts` | 上游数据 debounce hook |
| `utils/derive-node.ts` | 一键派生工具函数 |

---

## 八、下一步计划

### Week 3（优先）：AI 生成集成
- 将 AI 按钮的 `onSelect` 连接到 `deriveNode()` + LoadingNode 生成流程
- SSE 集成：图片生成、视频生成、高清放大
- 连线数据流传递（生成时遍历上游节点，自动填充 prompt/参考图）

### Week 5：分组 + 预览 + 下载 + 空状态
- GroupNode 增强（storyboard 角色 + 标题栏）
- 双击全屏预览
- 单文件下载
- 空画布引导卡片

### Week 4 剩余：AI 自动推荐
- 模型自动推荐逻辑（复用 `filterImageMediaModels` + `autoSelectCloudMediaModel`）
- 推荐 prompt（基于上游内容）
