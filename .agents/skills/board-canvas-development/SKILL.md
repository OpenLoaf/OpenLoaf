---
name: board-canvas-development
description: Use when developing, extending, or debugging the Board infinite canvas system in apps/web/src/components/board — adding nodes, tools, connectors, media generation, layouts, or fixing rendering/collaboration/performance issues
---

## Overview

Board 是 OpenLoaf 的无限画布白板系统，采用 Engine/Tool/View 三层分离架构。所有画布状态由 `CanvasEngine` 集中管理，通过订阅-发布模式驱动 React 渲染。

画布的核心交互单元是**文本便签节点**（TextNode with sticky style）。文本便签是画布的"起点"——用户在便签中输入内容后，通过节点下方的功能推荐按钮衍生出图片、视频、音频等媒体节点。整体工作流为：**文本输入 → AI 推荐 → 媒体生成**。

## When to Use

- 添加或修改画布节点类型（text/image/video/audio/link/group 等）
- 开发或修改文本便签节点及其功能推荐按钮系统
- 开发节点间上下游衍生逻辑（文生视频、图片反推提示词、文字转语音等）
- 添加或修改交互工具（select/hand/pen/eraser 等）
- 修改 Engine API、文档模型、选区、视口、历史记录
- 开发 AI 图片/视频/音频生成工作流（SaaS API、LoadingNode 轮询、模型过滤）
- 调试画布渲染、协作同步、性能问题
- 修改连接器逻辑、布局算法、输出放置

## Architecture

**数据流**: 用户交互 → Tool → Engine API → `doc.transact()` → 订阅者通知 → React 重渲染 → Yjs 同步远程

## Detailed References

按功能领域拆分为独立文件，按需查阅：

| 文件 | 内容 | 查阅时机 |
|------|------|----------|
| [engine-api.md](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/.agents/skills/board-canvas-development/engine-api.md) | Engine API 速查、Context/Hooks、状态订阅 | 任何画布代码修改 |
| [node-development.md](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/.agents/skills/board-canvas-development/node-development.md) | 节点开发 4 步流程、NodeDefinition 完整 API、现有节点参考 | 添加/修改节点类型 |
| [tool-development.md](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/.agents/skills/board-canvas-development/tool-development.md) | 工具开发、CanvasTool 接口、快捷键、ToolManager | 添加/修改交互工具 |
| [media-generation.md](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/.agents/skills/board-canvas-development/media-generation.md) | **V3 Variant 系统**（Feature 可见性三级判断、isApplicable 规则、variant 自主组装、新 feature 开发步骤）+ AI 媒体生成流程 | 媒体生成功能开发、新增画布 feature |
| [video-download.md](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/.agents/skills/board-canvas-development/video-download.md) | 视频 URL 下载（yt-dlp）、裁剪/Clip、导出、HLS 预转码、404 重启 | 视频下载/裁剪/导出开发 |
| [performance-and-collab.md](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/.agents/skills/board-canvas-development/performance-and-collab.md) | 性能优化模式、Yjs 协作层、空间索引、WebGPU | 性能调优/协作问题 |

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
| `LoadingNode.tsx` 变更 | media-generation.md, video-download.md |
| `lib/image-generation.ts` 模型过滤变更 | media-generation.md |
| `VideoNode.tsx` / `VideoTrimBar.tsx` 变更 | video-download.md |
| `videoDownloadRoutes.ts` / `videoDownloadService.ts` 变更 | video-download.md |
| `hlsService.ts` 错误处理/转码逻辑变更 | video-download.md |
| 新增节点类型 | node-development.md (现有节点参考表) |
| 新增工具类型 | tool-development.md (现有工具参考表) |
| `BoardCanvasCollab.tsx` 协作层变更 | performance-and-collab.md |
| `SpatialIndex.ts` / 渲染层变更 | performance-and-collab.md |

**同步规则**: 修改上述文件后，在提交前检查对应 skill 文件是否需要更新。保持 skill 与代码一致。
