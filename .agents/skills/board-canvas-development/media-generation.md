# Media Generation Nodes

## 三类媒体节点对比

| 维度 | imageGenerate | videoGenerate | imagePromptGenerate |
|------|--------------|---------------|---------------------|
| **type** | `image_generate` | `video_generate` | `image_prompt_generate` |
| **功能** | 文/图 → 新图片 | 文/图 → 视频 | 图 → 文本描述（图生文） |
| **输入** | 提示词(必需) + 多图(可选,最多9) | 提示词/图(至少一项,默认1图) | 单张图片(必需) |
| **输出** | ImageNode 1-5张 | VideoNode 1个 | resultText 文本 |
| **API** | `POST /ai/image` | `POST /ai/vedio` | `POST /ai/execute` SSE |
| **异步模式** | LoadingNode 轮询 | LoadingNode 轮询 | SSE 流式实时更新 |
| **高级设置** | 数量/宽高比/风格/负提示词 | 时长/宽高比/风格/负提示词/动态参数 | 无 |
| **connectable** | `auto` | `anchors` | `anchors` |

> 备注：tRPC `ai` 路由已弃用，媒体生成只走上述 SaaS HTTP 接口。

## 画布工作流

```
ImageNode ──→ imagePromptGenerate ──→ imageGenerate ──→ LoadingNode ──→ ImageNode(s)
  (照片)        (图生文: 描述)          (文生图)          (轮询中)        (生成结果)

ImageNode ──→ videoGenerate ──→ LoadingNode ──→ VideoNode
TextNode ───↗                    (轮询中)        (生成视频)
```

## 连线输入解析（三类节点共通）

所有媒体节点通过遍历 connector 动态获取上游输入（不存储在 props 中）：

```typescript
for (const item of engine.doc.getElements()) {
  if (item.kind !== 'connector') continue
  if (item.target.elementId !== element.id) continue
  const source = engine.doc.getElementById(item.source.elementId)
  if (!source || source.kind !== 'node') continue

  if (source.type === 'image')                inputImageNodes.push(source.props)
  if (source.type === 'text')                 inputTextSegments.push(source.props.value)
  if (source.type === 'image_prompt_generate') inputTextSegments.push(source.props.resultText)
}
// 提示词合并
const promptText = [upstreamText, localPrompt].filter(Boolean).join('\n')
```

## 图片/视频生成流程（异步轮询）

```
参数校验 → 创建 LoadingNode → 图片转 Base64 → 提交 SaaS → 写回 taskId → 轮询
```

### 1. 创建 LoadingNode

```typescript
const loadingNodeId = engine.addNodeElement(LOADING_NODE_TYPE, {
  taskType: 'image_generate',   // 或 'video_generate'
  sourceNodeId: element.id,
  promptText, workspaceId, projectId, saveDir,
}, [x, y, w, h])
engine.addConnectorElement({ source: { elementId: element.id }, target: { elementId: loadingNodeId } })
```

### 2. 提交任务

```typescript
// 图片
const result = await submitImageTask({
  modelId, prompt, negativePrompt?, style?,
  inputs?: { images: [{ base64, mediaType }] },
  output?: { count: 1-5, aspectRatio: '1:1'|'16:9'|'9:16'|'4:3' },
  parameters?, workspaceId?, projectId?, saveDir?, sourceNodeId?,
})

// 视频
const result = await submitVideoTask({
  modelId, prompt, negativePrompt?, style?,
  inputs?: {
    images?: [{ base64, mediaType }],       // 普通模式
    startImage?: { base64, mediaType },     // 首尾帧模式
    endImage?: { base64, mediaType },
  },
  output?: { aspectRatio?, duration?: 5|10 },
  parameters?, workspaceId?, projectId?, saveDir?, sourceNodeId?,
})
// → { success, data: { taskId } }
```

### 3. LoadingNode 轮询

```typescript
// LoadingNode.tsx useEffect
const maxAttempts = 300  // 每 2 秒轮询，最多 10 分钟

// 图片成功 → 创建 ImageNode(s) + 多图自动分组
// 视频成功 → 后端已下载到 saveDir → 创建 VideoNode
// 失败 → 更新源节点 errorText
// 卸载 → AbortController.abort() + cancelTask(taskId)
```

### 4. 清理

```typescript
clearLoadingNode(engine, loadingNodeId)
// → 删除 LoadingNode + 关联 connector
```

## 图生文流程（SSE 流式）

```typescript
// imagePromptGenerate/index.tsx
const userMessage = {
  role: 'user',
  parts: [
    { type: 'file', url: imageUrl, mediaType },
    { type: 'text', text: IMAGE_PROMPT_TEXT },  // 系统提示词模板
  ],
}

await runChatSseRequest({
  payload: { sessionId, messages: [userMessage], chatModelId, intent: 'image', responseMode: 'stream' },
  signal: controller.signal,
  onEvent: (event) => {
    streamedText += extractDelta(event)
    engine.doc.updateNodeProps(nodeId, { resultText: streamedText })
    scheduleAutoHeight()  // 节点高度随内容增长
  },
})
```

**SSE 端点**: `POST /ai/execute`，按 `\n\n` 分割事件，`data:` 前缀 JSON，`[DONE]` 终止。

## 模型过滤系统

### filterImageMediaModels

```typescript
filterImageMediaModels(models, { imageCount, hasMask, outputCount })
```

| 条件 | 要求 |
|------|------|
| 基础 | tag: `image_generation` |
| 遮罩 | tag: `image_edit` + `capabilities.input.supportsMask` |
| 多图输入 | tag: `image_multi_input` + `maxImages >= N` |
| 单图输入 | tag: `image_input` 或 `image_multi_input` |
| 多图输出 | `capabilities.output.supportsMulti` |

### filterVideoMediaModels

```typescript
filterVideoMediaModels(models, { imageCount, hasReference, hasStartEnd, withAudio })
```

| 条件 | 要求 |
|------|------|
| 基础 | tag: `video_generation` |
| 参考视频 | tag: `video_reference` |
| 首尾帧 | tag: `video_start_end` + `supportsStartEnd` |
| 音频输出 | tag: `video_audio_output` + `supportsAudio` |

### imagePromptGenerate 过滤

`filterModelOptionsByTags`: 必需 `[image_input, text_generation]`，排除 `[image_edit, image_generation, code]`

### 自动选择 + 降级

```typescript
// 候选为空时取第一个; 视频节点有额外降级：过滤空 → 回退全量模型
if (filtered.length === 0 && inputImageCount <= 1) return videoModels
```

## Props 类型

### ImageGenerateNodeProps

```typescript
{ modelId?, chatModelId?, promptText?, style?, negativePrompt?,
  outputAspectRatio?, outputCount?: 1-5, parameters?,
  resultImages?: string[], errorText? }
```

### VideoGenerateNodeProps

```typescript
{ modelId?, chatModelId?, promptText?, negativePrompt?, style?,
  durationSeconds?: 5|10, aspectRatio?, outputAudio?: boolean,
  parameters?, resultVideo?: string, errorText? }
```

### ImagePromptGenerateNodeProps

```typescript
{ chatModelId?, resultText?, errorText? }
```

### LoadingNodeProps

```typescript
{ taskId?, taskType?: 'video_generate'|'image_generate',
  sourceNodeId?, promptText?, chatModelId?,
  workspaceId?, projectId?, saveDir? }
```

## 动态参数渲染（视频节点独有）

视频节点 AdvancedSettingsPanel 根据模型 `parameters.fields` 动态生成表单字段：

```typescript
type ModelParameterDefinition = {
  key: string, label?, type: 'select'|'number'|'boolean'|'text',
  values?: string[], min?, max?, step?, default?
}

// resolveParameterDefaults() 自动补齐缺失的默认值
```

## 输出布局

```typescript
// output-placement.ts → resolveRightStackPlacement()
// 首次：源节点右侧，垂直居中
// 后续：已有输出下方堆叠 (gap=32)
// 高级面板打开时额外偏移 256px
```

## 共享常量 (node-config.ts)

```typescript
IMAGE_GENERATE_MAX_INPUT_IMAGES = 9
IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT = 1
VIDEO_GENERATE_DEFAULT_MAX_INPUT_IMAGES = 1
VIDEO_GENERATE_DURATION_OPTIONS = [5, 10]
VIDEO_GENERATE_OUTPUT_WIDTH/HEIGHT = 320/180
ADVANCED_PANEL_OFFSET_PX = 256
GENERATED_IMAGE_NODE_GAP = 32
GENERATED_IMAGE_NODE_FIRST_GAP = 120
GENERATE_ASPECT_RATIO_OPTIONS = ['1:1', '16:9', '9:16', '4:3']
GENERATE_STYLE_SUGGESTIONS = ['写实', '动漫', '插画', '3D', ...]
```

## SaaS API 速查

```typescript
submitImageTask(payload)   // POST /ai/image
submitVideoTask(payload)   // POST /ai/vedio
pollTask(taskId)           // GET /ai/task/:taskId → { status, resultUrls, error? }
cancelTask(taskId)         // POST /ai/task/:taskId/cancel
fetchImageModels()         // GET /ai/image/models
fetchVideoModels()         // GET /ai/vedio/models
// 前端缓存: useMediaModels() hook
```

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 直接提交不创建 LoadingNode | 先创建 LoadingNode → 提交 → 写回 taskId |
| LoadingNode 不连 connector | 必须 `addConnectorElement` 连接源和 LoadingNode |
| 手动轮询不处理卸载 | AbortController + cleanup 中 cancelTask |
| 图片不转 Base64 | SaaS 要求 `{ base64, mediaType }` 格式 |
| 视频不处理首尾帧 | 检查 `supportsStartEnd` 决定 inputs 格式 |
| 新标签不加过滤规则 | 在 filterImageMediaModels/filterVideoMediaModels 中添加 |
| clearLoadingNode 后不清 connector | `clearLoadingNode` 已处理，自行删除需手动清理 |
| imagePromptGenerate 高度不跟随 | 必须用 `useAutoResizeNode` / `scheduleAutoHeight` |

## Debugging

1. **模型为空**: `useMediaModels()` → SaaS 登录 → `/ai/image/models` 响应
2. **任务 pending**: LoadingNode.props.taskId 是否写入 → pollTask 返回值
3. **图片不显示**: `buildImageNodePayloadFromUri` → previewSrc 有效性
4. **连线输入未识别**: connector 的 target.elementId 是否匹配
5. **SSE 中断**: `[DONE]` 解析 → AbortController 是否提前触发
6. **输出位置重叠**: `resolveRightStackPlacement` → 已有输出的 xywh
