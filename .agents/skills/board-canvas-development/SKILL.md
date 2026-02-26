---
name: board-canvas-development
description: Use when developing, extending, or debugging the Board infinite canvas system in apps/web/src/components/board — adding nodes, tools, connectors, media generation, layouts, or fixing rendering/collaboration/performance issues
---

# Board Canvas Development

## Overview

Board 是 OpenLoaf 的无限画布白板系统，采用 Engine/Tool/View 三层分离架构。所有画布状态由 `CanvasEngine` 集中管理，通过订阅-发布模式驱动 React 渲染。

## When to Use

- 添加或修改画布节点类型（text/image/video/link/group/AI 生成）
- 添加或修改交互工具（select/hand/pen/eraser 等）
- 修改 Engine API、文档模型、选区、视口、历史记录
- 开发 AI 图片/视频生成工作流（SaaS API、LoadingNode 轮询、模型过滤）
- 调试画布渲染、协作同步、性能问题
- 修改连接器逻辑、布局算法、输出放置

## Architecture

```
React View Layer (BoardCanvas, Interaction, Render)
        ↓ useBoardSnapshot()
Canvas Engine (CanvasEngine — 核心状态中枢)
   ├── CanvasDoc         — 元素 CRUD + transact 批量操作
   ├── NodeRegistry      — 节点定义注册（插件化）
   ├── ToolManager       — 工具注册 + 事件路由
   ├── SelectionManager  — 选区状态
   ├── ViewportController — 视口变换（zoom/pan/坐标转换）
   └── SpatialIndex      — 网格空间索引（加速框选/裁剪）
```

**数据流**: 用户交互 → Tool → Engine API → `doc.transact()` → 订阅者通知 → React 重渲染 → Yjs 同步远程

## Detailed References

按功能领域拆分为独立文件，按需查阅：

| 文件 | 内容 | 查阅时机 |
|------|------|----------|
| [engine-api.md](engine-api.md) | Engine API 速查、Context/Hooks、状态订阅 | 任何画布代码修改 |
| [node-development.md](node-development.md) | 节点开发 4 步流程、NodeDefinition 完整 API、现有节点参考 | 添加/修改节点类型 |
| [tool-development.md](tool-development.md) | 工具开发、CanvasTool 接口、快捷键、ToolManager | 添加/修改交互工具 |
| [media-generation.md](media-generation.md) | AI 图片/视频生成、SSE 流式、LoadingNode 轮询、模型过滤、SaaS API | 媒体生成功能开发 |
| [performance-and-collab.md](performance-and-collab.md) | 性能优化模式、Yjs 协作层、空间索引、WebGPU | 性能调优/协作问题 |

## Key Files Map

```
apps/web/src/components/board/
├── engine/
│   ├── types.ts              ← 所有核心类型
│   ├── CanvasEngine.ts       ← 引擎主类 (~2600行)
│   ├── CanvasDoc.ts          ← 文档模型
│   ├── NodeRegistry.ts       ← 节点注册表
│   ├── SelectionManager.ts   ← 选区管理
│   ├── ViewportController.ts ← 视口控制
│   └── SpatialIndex.ts       ← 空间索引
├── core/
│   ├── board-nodes.ts        ← 节点注册入口
│   ├── BoardProvider.tsx     ← React Context
│   ├── BoardCanvas.tsx       ← 主容器
│   ├── BoardCanvasCollab.tsx ← Yjs 协作层
│   └── useBoardSnapshot.ts  ← Engine→React 桥接
├── tools/
│   ├── ToolManager.ts        ← 工具管理 + 快捷键
│   ├── ToolTypes.ts          ← 工具接口
│   ├── SelectTool.ts         ← 选择工具 (~830行)
│   └── HandTool.ts / StrokeTools.ts / EraserTool.ts
├── nodes/
│   ├── node-config.ts        ← 共享常量
│   ├── LoadingNode.tsx       ← 异步任务轮询
│   ├── TextNode.tsx / ImageNode.tsx / VideoNode.tsx / ...
│   ├── imageGenerate/        ← AI 图片生成
│   ├── videoGenerate/        ← AI 视频生成
│   ├── imagePromptGenerate/  ← 图生文
│   └── lib/                  ← 共享工具 (模型过滤/SSE/自动高度)
├── render/                   ← WebGPU / SVG 渲染层
├── utils/                    ← 坐标/DOM/导出/布局/路径
├── toolbar/ / controls/ / ui/
└── index.ts                  ← 导出 ProjectBoardCanvas
```

## Skill Sync Policy

**当以下文件发生变更时，应检查并同步更新本 skill：**

| 变更范围 | 需更新的文件 |
|----------|-------------|
| `engine/types.ts` 类型变更 | engine-api.md, node-development.md |
| `engine/CanvasEngine.ts` API 变更 | engine-api.md |
| `NodeRegistry.ts` 或 `board-nodes.ts` 变更 | node-development.md |
| `tools/ToolTypes.ts` 或 `ToolManager.ts` 变更 | tool-development.md |
| `imageGenerate/` `videoGenerate/` `imagePromptGenerate/` 变更 | media-generation.md |
| `node-config.ts` 常量变更 | media-generation.md, node-development.md |
| `LoadingNode.tsx` 变更 | media-generation.md |
| `lib/image-generation.ts` 模型过滤变更 | media-generation.md |
| 新增节点类型 | node-development.md (现有节点参考表) |
| 新增工具类型 | tool-development.md (现有工具参考表) |
| `BoardCanvasCollab.tsx` 协作层变更 | performance-and-collab.md |
| `SpatialIndex.ts` / 渲染层变更 | performance-and-collab.md |

**同步规则**: 修改上述文件后，在提交前检查对应 skill 文件是否需要更新。保持 skill 与代码一致。
