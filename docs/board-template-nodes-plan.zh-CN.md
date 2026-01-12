# 画布节点插入与图片提示词节点方案（MVP）

## 背景与问题

当前画布里「图片 → 生成提示词」走 `/chat/sse` 自动选模型。服务端会根据消息 parts 推断 `requiredTags`，但此前把普通图片输入误判成 `image_edit`，导致筛选不到模型时报错：`未找到支持图片编辑的模型`。

同时，画布现有「一级/二级」插入列表如果再叠加「模型选择」会变得很繁琐，不符合画布高频操作的直觉。

## 目标

1. 交互更轻：从“多级列表”改为“节点选择 + 节点承载结果”。
2. 结果落地在图片提示词节点中（不再固定创建文本节点）。
3. 模型选择最小打扰：
   - 默认优先使用用户的默认聊天模型（若满足标签）
   - 不满足时才要求用户在节点内选择
   - 如果没有任何匹配模型，引导用户去设置配置
4. 「生成提示词」所需标签是 **AND**：`image_input` + `text_generation`。

## 交互方案（方案 E：节点选择器 + 图片提示词节点）

### 1) 连线创建节点：弹出节点选择器（单层）

用户从图片节点拖出连线，在空白处松开时：

- 弹出一个“节点选择器”（单层列表 + 搜索）
- 选择后创建目标节点，并自动连线

MVP 可选节点：

- `文字`：插入普通文本节点
- `图片提示词`：插入图片提示词节点，用于生成图片描述

### 2) 结果落地：图片提示词节点承载运行、模型、输出

`图片提示词` 节点内包含：

- 模型选择下拉（只展示满足标签的模型）
- 运行 / 重试 / 停止
- 输出区域（流式写入，最终结果保留在节点内）

### 3) 模型选择策略（最小打扰）

图片提示词节点的模型选择顺序：

1. 若节点自身已保存 `chatModelId`，优先使用它
2. 否则尝试使用全局默认聊天模型（若满足标签）
3. 否则使用候选列表的第一个模型
4. 若候选列表为空：节点进入 `needs_model` 并提示用户去设置配置

> 说明：图片提示词节点会把最终选中的 `chatModelId` 写回到节点 props，后续不需要重复选择。

## 数据结构（节点 props）

MVP 只做一个图片提示词节点：`image_prompt_generate`

```ts
type ImagePromptGenerateNodeProps = {
  chatModelId?: string;           // profileId:modelId
  resultText?: string;            // 流式输出累积
  errorText?: string;             // 错误提示
};
```

## 运行链路（MVP）

### 触发

- 选择节点后创建 `image_prompt_generate` 节点并自动连线
- 节点渲染后：
  - 自动确定 `chatModelId`（按上面的策略）
  - 点击“运行”后调用画布 actions 开始执行

### 请求

向 `/chat/sse` 发送（关键字段）：

- `messages[0].parts = [{type:"file", url, mediaType}, {type:"text", text: prompt}]`
- `chatModelId`：必须显式指定（避免服务端误推断/误路由）
- `chatModelSource`：local/cloud（按用户设置）
- `trigger = "board-image-prompt"`

### 输出

- 解析 SSE `text-delta` 事件
- 按 chunk 更新 `resultText`
- 完成后 `status = done`
- 失败后 `status = error` 并写入 `errorText`

## 服务端 requiredTags 修复原则

服务端在未显式指定 `chatModelId` 时会推断 `requiredTags`：

- 默认至少需要：`text_generation`
- 遇到普通图片输入：追加 `image_input`
- 遇到 `purpose=mask`：追加 `image_edit`

> 对于画布“图片提示词”模板，前端会显式传 `chatModelId`，因此服务端推断仅作为兜底与其他链路修复。

## 实施计划（按 MVP）

### Phase 1：交互改造（已实现）

1. 用 `NodePicker` 替代旧的多级插入面板
2. 可选节点由源节点定义提供（`connectorTemplates`），不再使用全局模板目录
3. 新增 `ImagePromptGenerateNode`（`type="image_prompt_generate"`）并注册到 board
4. 图片提示词节点结果保留在节点中，不再生成文本节点

### Phase 2：模型选择（已实现）

1. 以 `image_input + text_generation` 过滤候选模型（AND）
2. 排除 `image_edit` / `image_generation`（避免 `/chat/sse` 被误路由到图片流）
3. 自动写回选择的 `chatModelId` 到节点 props

### Phase 3：后端兜底修复（已实现）

1. `resolveRequiredInputTags`：
   - 普通图片输入 → `image_input`
   - 默认追加 `text_generation`

### Phase 4：验收（建议你本地做一次）

1. 启动现有 web/server（你环境里已在跑 next dev，避免重复启动）
2. 画布拖出连线 → 选择 `图片提示词`
3. 节点内自动选中一个满足标签的模型，点击运行
4. 输出流式写入并最终保留在图片提示词节点中

## 代码落点（当前实现）

- 节点选择器：`apps/web/src/components/board/core/NodePicker.tsx`
- 图片提示词节点：`apps/web/src/components/board/nodes/ImagePromptGenerateNode.tsx`
- 连接模板定义：`apps/web/src/components/board/nodes/ImageNode.tsx`
- 画布执行链路：`apps/web/src/components/board/core/BoardCanvas.tsx`
- 服务端 requiredTags：`apps/server/src/ai/chat-stream/modelResolution.ts`
