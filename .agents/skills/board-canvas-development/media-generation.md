
## 三类媒体节点对比

| 维度 | imageGenerate | videoGenerate | imagePromptGenerate |
|------|--------------|---------------|---------------------|
| **type** | `image_generate` | `video_generate` | `image_prompt_generate` |
| **功能** | 文/图 → 新图片 | 文/图 → 视频 | 图 → 文本描述（图生文） |
| **输入** | 提示词必需，多图可选，最多 9 张 | 提示词和图片至少一项 | 单张图片必需 |
| **输出** | ImageNode 1-5 张 | VideoNode 1 个 | `resultText` 文本 |
| **接口** | `POST /ai/image` | `POST /ai/vedio` | `POST /ai/execute` SSE |
| **异步模式** | LoadingNode 轮询 | LoadingNode 轮询 | SSE 流式更新 |

> 备注：Board 节点走 SaaS HTTP 接口，不再走旧的 tRPC `ai` 路由。

## 输入解析与异步任务

- 图片和视频节点都通过 connector 动态收集上游输入，不把媒体输入冗余存进 props。
- 异步生成流程固定为：
  1. 先创建 LoadingNode
  2. 建立 source → loading 的连接
  3. 提交任务
  4. 将返回的 `taskId` 写回 LoadingNode
  5. 轮询直到创建最终节点并清理 LoadingNode
- LoadingNode 和提交 payload 当前都只使用：
  - `projectId`
  - `saveDir`
  - `sourceNodeId`
- 不要再向 Board 媒体链路写入历史工作空间字段。

## 媒体保存路径规则（重要）

### 画布的两种类型

| 类型 | projectId | 说明 |
|------|-----------|------|
| **项目画布** | 有值（如 `proj_xxx`） | 属于某个 Project，数据存于项目根目录下 |
| **临时/全局画布** | 空/undefined | 不属于任何 Project，数据存于全局临时目录 |

### 前端 saveDir 决策

三个节点（`imageGenerate`、`videoGenerate`、`chatInput`）统一使用以下逻辑：

```ts
const imageSaveDir = useMemo(() => {
  if (boardFolderScope) {
    // 统一使用相对路径，服务端根据有无 projectId 决定解析根目录
    return normalizeProjectRelativePath(
      `${boardFolderScope.relativeFolderPath}/${BOARD_ASSETS_DIR_NAME}`
    );
  }
  return "";
}, [boardFolderScope]);
```

**关键规则**：前端始终传相对路径（如 `boards/board_xxx/asset`），**不需要**区分项目画布和临时画布。路径解析的复杂性全部由服务端处理。

### `boardFolderScope` 的边界行为

`resolveBoardFolderScope(fileContext)` 返回 `{ projectId, relativeFolderPath }`：
- **项目画布**：`projectId` 有值，`relativeFolderPath` 如 `boards/board_xxx`
- **临时画布**：`projectId` 为空字符串 `""`，`relativeFolderPath` 同样有值
- **无画布上下文**：返回 `null`

前端**不需要**检查 `boardFolderScope.projectId` 是否为空。只要 `boardFolderScope` 存在就使用相对路径。

### 服务端保存路径解析

`resolveImageSaveDirectory` / `resolveVideoSaveDirectory` 支持三种 saveDir 格式：

| saveDir 格式 | 示例 | 解析方式 | 是否需要 projectId |
|-------------|------|---------|-------------------|
| `file://` URI | `file:///Users/.openloaf/temp/boards/xxx/asset` | `resolveFilePathFromUri()` 直接转本地路径 | 不需要 |
| `@[projectId]/path` | `@[proj_123]/boards/xxx/asset` | 从内嵌的 projectId 解析 root + 拼接 | 内嵌在 saveDir 里 |
| 相对路径 | `boards/board_xxx/asset` | 按 projectId 有无选择根目录 | 可选 |

**相对路径解析的 fallback 规则**（`resolveRelativeSaveDirectory`）：

```
有 projectId → getProjectRootPath(projectId) 作为根目录
无 projectId → getResolvedTempStorageDir() 作为根目录（默认 ~/.openloaf/temp/）
```

`getResolvedTempStorageDir()` 读取 `basicConfig.appTempStorageDir`，为空时回退到 `~/.openloaf/temp/`。

### 服务端返回路径

保存成功后，返回给前端的路径格式：

| 场景 | 返回路径格式 | 示例 |
|------|------------|------|
| 有 projectId | `saveDir/fileName`（项目相对路径） | `boards/board_xxx/asset/20260315_130031.png` |
| 无 projectId | 全局相对路径（相对 `~/.openloaf/`） | `temp/boards/board_xxx/asset/20260315_130031.png` |

无 projectId 时通过 `toGlobalRelativePath()` 将绝对路径转为相对 `getOpenLoafRootDir()` 的路径，前端 preview endpoint 可直接全局加载。

### 任务恢复（服务重启场景）

- 提交时 `rememberMediaTask()` 存入内存 Map + 持久化到 `tasks.json`
- 持久化路径：`<projectRoot>/<boardDir>/tasks.json`（需要 projectId + saveDir）
- **临时画布没有 projectId → 不持久化到 tasks.json → 服务重启后无法恢复**（已知限制）
- 轮询时内存未命中 → 尝试从 `tasks.json` 恢复，但同样需要 projectId

## 图生文流程

- `imagePromptGenerate` 通过 `POST /ai/execute` 走 SSE。
- 前端按事件流持续更新 `resultText` / `errorText`。
- 终止条件是收到 `[DONE]` 或主动中止请求。

### imageGenerate

| 条件 | 要求 |
|------|------|
| 基础 | tag: `image_generation` |
| 遮罩 | tag: `image_edit` + `capabilities.input.supportsMask` |
| 多图输入 | tag: `image_multi_input` + `maxImages >= N` |
| 单图输入 | tag: `image_input` 或 `image_multi_input` |
| 多图输出 | `capabilities.output.supportsMulti` |

### videoGenerate

| 条件 | 要求 |
|------|------|
| 基础 | tag: `video_generation` |
| 参考视频 | tag: `video_reference` |
| 首尾帧 | tag: `video_start_end` + `supportsStartEnd` |
| 音频输出 | tag: `video_audio_output` + `supportsAudio` |

### imagePromptGenerate

- 只接受同时满足 `image_input` 与 `text_generation` 的模型。
- 需要显式排除 `image_edit`、`image_generation`、`code` 等无关标签。

## 动态参数与运行时字段

- 视频节点的高级参数来自模型定义里的 `parameters.fields`。
- LoadingNode 关注的核心运行时字段包括：
  - `taskId`
  - `taskType`
  - `sourceNodeId`
  - `promptText`
  - `chatModelId`
  - `projectId`
  - `saveDir`

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 直接提交任务，不先建 LoadingNode | 先建 LoadingNode，再提交并写回 `taskId` |
| LoadingNode 没有 connector | 必须保留源节点到 LoadingNode 的连接 |
| 图片未转 `{ base64, mediaType }` | SaaS 提交前统一转成 base64 payload |
| 视频不区分普通模式与首尾帧模式 | 根据 `supportsStartEnd` 决定 `inputs` 结构 |
| 新模型未补过滤规则 | 同步更新图片/视频节点的过滤逻辑 |
| 清理 LoadingNode 时遗留 connector | 保证节点和连线一起清理 |
| 前端判断 `boardFolderScope.projectId` 再选路径策略 | 始终用相对路径，服务端处理 projectId 有无的 fallback |
| 临时画布用 `file://` URI 作为 saveDir | 统一用相对路径，服务端 fallback 到 `appTempStorageDir` |

## Debugging

1. 模型为空时先检查 SaaS 登录态和模型接口响应。
2. 任务卡住时先看 LoadingNode 上是否写入 `taskId`。
3. 图片或视频不显示时检查最终节点 payload 是否完整。
4. 连线输入未识别时重点检查 connector 的 target/source 关系。
5. SSE 中断时优先确认 `[DONE]` 处理和 AbortController 生命周期。
6. "保存目录无效" 错误时检查：saveDir 是否为空、projectId 为空时 `getResolvedTempStorageDir()` 是否返回有效路径。
7. 临时画布生成的媒体不显示时，检查返回路径是否为全局相对路径（`temp/boards/...`），以及 preview endpoint 是否支持无 projectId 的全局路径。

## 关键代码位置

| 模块 | 文件 |
|------|------|
| 前端 saveDir 决策 | `apps/web/src/components/board/nodes/imageGenerate/index.tsx` |
| 前端 saveDir 决策 | `apps/web/src/components/board/nodes/videoGenerate/index.tsx` |
| 前端 saveDir 决策 | `apps/web/src/components/board/nodes/chatInput/index.tsx` |
| boardFolderScope 解析 | `apps/web/src/components/board/core/boardFilePath.ts` |
| 服务端图片路径解析 | `apps/server/src/ai/services/image/imageStorage.ts` |
| 服务端视频路径解析 | `apps/server/src/ai/services/video/videoStorage.ts` |
| 服务端轮询 + 返回路径 | `apps/server/src/modules/saas/modules/media/mediaProxy.ts` |
| 任务上下文持久化 | `apps/server/src/modules/saas/modules/media/mediaTaskStore.ts` |
| 临时存储目录配置 | `apps/server/src/modules/settings/openloafConfStore.ts`（`appTempStorageDir`） |
| 临时存储目录解析 | `apps/server/src/ai/services/image/imageStorage.ts`（`getResolvedTempStorageDir`） |
