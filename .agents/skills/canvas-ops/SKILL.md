---
name: Canvas Operations
description: 画布 CRUD、节点操作、布局优化指南
---

# 画布操作指南

## 可用工具
- `canvas-add-node`: 添加节点（文本、图片、代码、链接等）
- `canvas-update-node`: 更新节点内容或样式
- `canvas-remove-node`: 删除节点
- `canvas-layout`: 自动布局优化

## 操作规范
- 创建节点前确认画布上下文（boardId）
- 大批量节点操作分批执行，避免阻塞
- 布局调整后通知用户检查结果
- 节点类型: text, image, code, link, sticky, group

## 常见场景
- 用户要求"整理画布" → 使用 canvas-layout 自动排列
- 用户要求"添加笔记" → 使用 canvas-add-node type=sticky
- 用户要求"画流程图" → 分步创建节点 + 连接线
