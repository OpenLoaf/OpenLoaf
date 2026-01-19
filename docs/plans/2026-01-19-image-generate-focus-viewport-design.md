# ImageGenerate 输入聚焦视图设计

## 背景

用户点击图片生成节点的输入框时，希望画布自动平滑移动并缩放，使该节点居中且完整可见，便于输入提示词。

## 目标

- 仅在输入框获得焦点时触发
- 平滑动画，不修改文档数据
- 只关注目标节点矩形，不关心节点类型
- 如果用户正在拖拽/缩放/平移，则不触发

## 方案概述

在 `CanvasEngine` 新增通用方法 `focusViewportToRect(rect, options)`：

- 输入为世界坐标矩形（节点 `xywh`）
- 计算目标缩放与偏移，使矩形中心对齐视口中心并完整可见
- 使用 `requestAnimationFrame` 平滑插值过渡 `zoom/offset`

`ImageGenerateNode` 在输入框 `onFocus` 触发时调用该方法，传入节点矩形。

## 动画与视口计算

- 目标 zoom：按视口尺寸与目标矩形计算可容纳比例，应用 padding（默认 120）
- 目标 offset：使矩形中心落到视口中心
- 动画时长：建议 240–320ms，缓动 `easeOut`（如 `t*(2-t)`）
- clamp zoom：遵循 `ViewportController` 的 min/max

## 触发与节流

- 仅在输入框 `onFocus` 触发
- 若 `engine` 处于拖拽/缩放/平移状态则直接返回
- 使用 `useRef` 做轻量节流（如 300ms）

## 边界与异常处理

- 若视口尺寸为 0，直接返回
- 若目标已接近当前视图（偏移/缩放差距小于阈值），不触发
- 动画中不写入文档，避免影响 undo/redo

## 可复用性

`focusViewportToRect` 作为通用能力，可被其他节点或选区复用。
