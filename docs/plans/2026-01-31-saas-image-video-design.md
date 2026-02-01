# 图像/视频生成 SaaS 化改造：产品设计文档（草案）

日期：2026-01-31

## 一、背景与目标
现有画布中的图像/视频生成能力为临时实现，需要升级为 SaaS 统一接口的生产方案，并确保前后端流程清晰、能力可扩展。

目标：
- 图像/视频生成统一走 SaaS 接口（`/ai/image`、`/ai/vedio`）
- 服务端代理调用，前端发起轮询
- SaaS 返回 URL，服务端落库到画布资产目录后返回项目内地址
- 画布交互体验统一：点击运行即创建 LoadingNode

## 二、范围与不做事项
范围内：
- 图像/视频生成 SaaS 接入与任务轮询
- 画布节点与参数输入改造
- 模型列表缓存与前端筛选
- 资源下载落库与错误处理

不做事项：
- 自动模式（AI 自动选择模型）
- 建议生成与提示词自动推荐
- 视频修改（未来实现）
- 图像角度控制（未来实现）

## 三、画布改造方案（高层）
画布功能需要从“临时直连模型”升级为“标准 SaaS 任务流”，主要改造点：
- 仍保留两类节点：ImageGenerateNode / VideoGenerateNode
- 输入类型自动判定：
  - 图片：无输入为文生图；1 张图为单图；多张图为多图
  - 遮罩：在 ImageNode 内叠加遮罩，连接到图片生成节点即视为“原图 + 遮罩”输入
  - 视频：连接视频素材即视为参考视频输入
- 连接线提示：参考视频的连接线上展示“参考”文字提示
- 运行态统一：点击运行 -> 创建 LoadingNode（显示进度/状态文本） -> 轮询 -> 结果节点替换
- 多图结果：自动水平排布并合并为一个结果组
- 运行中可取消：前端调用 SaaS 取消接口（服务端代理）；若 SaaS 不支持取消则仅停止轮询
- 参数区与模型选择的最终方案：
  - 参数区采用“双层布局”：基础参数常显，高级参数折叠
  - 模型选择入口放在节点内顶部下拉（仅显示筛选后的可用模型）
  - 输入类型增加“输入摘要行”只读展示（如“单图 + 遮罩”、“首尾帧 + 参考视频”）

### 输入摘要行规范（建议）
- 图片节点：
  - 无输入：`文生图`
  - 1 张输入：`单图`
  - 多张输入：`多图`
  - 叠加遮罩：追加 `+ 遮罩`（例如 `单图 + 遮罩`）
- 视频节点：
  - 单图输入：`单图`
  - 首尾帧（2 张图）：`首尾帧`
  - 参考视频连接：追加 `+ 参考`（例如 `单图 + 参考`）

## 四、功能需求（图片生成）
### 4.1 图生图
#### 单图输入
- 遮罩修改（重绘/擦除）
- 抠图/换背景
- 扩图
- 画质增强
- 角度控制（未来实现）

#### 多图输入
- 多张图作为参考输入（具体融合/一致性策略由 SaaS 模型能力决定）

### 4.2 文生图
- 纯文本生成图像

### 4.3 图片生成参数
- 风格
- 正向提示词
- 反向提示词
- 生成数量
- 输出大小

#### 参数分区建议
- 基础参数：正向提示词、风格、生成数量、输出大小
- 高级参数：反向提示词

## 五、功能需求（视频生成）
### 5.1 单图生成视频
- 可选参考视频，支持动作模仿/视频换人

### 5.2 首尾帧生成视频
- 2 张图片作为首尾帧输入

### 5.3 视频修改
- 未来实现

### 5.4 视频生成参数
- 风格
- 正向提示词
- 反向提示词
- 生成数量
- 输出比例
- 清晰度
- 时长
- 是否添加声音

#### 参数分区建议
- 基础参数：正向提示词、风格、生成数量、输出比例、时长
- 高级参数：反向提示词、清晰度、是否添加声音

## 六、模型列表与前端筛选
- 服务端启动或每日定时从 SaaS 拉取模型列表并缓存
- 前端根据模型能力做筛选，避免用户选择不可实现的模型
- 若模型不支持的参数（如遮罩、音频输出）被勾选，则前端只保留支持能力的模型
- 数量/尺寸等“可补偿能力”由 SaaS 内部处理，前端仍可显示

## 七、参数与模型兼容策略（SaaS 侧补偿）
- 前端统一参数结构：风格、正向提示词、反向提示词、生成数量、输出大小（视频额外包含比例、清晰度、时长、音频）
- SaaS 负责将“通用参数”映射为模型实际字段
- 若模型不支持风格/反向提示词等字段，SaaS 通过提示词合成进行兼容
- 若模型不支持多图输出，SaaS 拆分为多次任务并使用不同 seed
- 遮罩、音频等属于模型硬能力，仍由前端筛选保证可用

## 八、SDK 统一契约与服务端代理
- SaaS 提供 SDK：包含类型定义与基础请求协议
- 服务端基于 SDK 类型定义对外提供接口，保持前端与 SaaS 契约一致
- 服务端转发前可进行预处理：参数缺省补齐、资源归一化、鉴权注入
- 服务端转发后可进行预处理：状态归一化、错误映射

## 九、SaaS 接口设计（SDK 对齐）
### 9.1 SDK 模块结构（建议）
- `packages/sdk/src/modules/llm/`：仅用于聊天模型（chat）相关接口
- `packages/sdk/src/modules/ai/`：新增图像/视频生成接口模块（`schemas.ts` / `endpoints.ts` / `client.ts`）
- `contract.ts` 中挂载 `ai` 模块，风格与现有 `llm` 模块一致
- 接口返回统一 `success/data/message/code` 包装

### 9.2 通用约定
- 接口路径：`/ai/*`（如需 `/api` 前缀，可通过 `baseUrl` 配置映射）
- 媒体输入统一结构：`{ url?: string; base64?: string; mediaType?: string }`（二选一）
- 输出尺寸：`size = "1024x1024"`，比例：`aspectRatio = "16:9"`，时长单位为秒
- 生成数量 `count` 主要用于图片；视频可忽略或仅支持 1

#### 统一响应包（示意）
```json
{ "success": true, "data": { /* payload */ } }
```
```json
{ "success": false, "code": "INVALID_REQUEST", "message": "xxx" }
```

### 9.3 生成接口（图片）
`POST /ai/image`

请求字段（统一结构）：  
`modelId`、`prompt`、`negativePrompt?`、`style?`  
`inputs.images?[]`、`inputs.mask?`  
`output.count?`、`output.size?`、`output.aspectRatio?`  
`parameters?`（模型扩展参数）

规则：  
- 文生图：`inputs.images` 为空  
- 单图：`inputs.images` 1 张  
- 多图：`inputs.images` 多张  
- 遮罩编辑：`inputs.mask` + 1 张原图

示例：
```json
{
  "modelId": "qwen-image-edit-plus",
  "prompt": "一只小熊在跳舞",
  "negativePrompt": "画面具有AI感",
  "style": "动漫风",
  "inputs": {
    "images": [{ "url": "https://..." }],
    "mask": { "url": "https://..." }
  },
  "output": { "count": 2, "size": "1024x1024" }
}
```

### 9.4 生成接口（视频）
`POST /ai/vedio`

请求字段（统一结构）：  
`modelId`、`prompt`、`negativePrompt?`、`style?`  
`inputs.images?[]`、`inputs.startImage?`、`inputs.endImage?`、`inputs.referenceVideo?`  
`output.aspectRatio?`、`output.duration?`、`output.clarity?`、`output.withAudio?`  
`parameters?`

规则：  
- 单图：`inputs.images` 1 张  
- 首尾帧：`startImage + endImage`  
- 参考视频：追加 `referenceVideo`

### 9.5 任务查询接口
`GET /ai/task/{taskId}`

返回字段：  
`status`（queued/running/succeeded/failed/canceled）  
`progress?`（0-100）  
`resultType?`（image/video）  
`resultUrls?`（图片/视频 URL 列表）  
`error?`（code/message）

### 9.6 任务取消接口
`POST /ai/task/{taskId}/cancel`

返回字段：  
`status`（canceled/processing）  
说明：是否真正中断底层生成由 SaaS 能力决定。

### 9.7 模型列表接口
`GET /ai/models`

返回字段：  
- `data`: 模型能力清单（结构参考 `packages/api/src/common/modelTypes.ts`）  
- `updatedAt`: 更新时间（用于调试与缓存）

建议扩展字段（满足前端筛选）：  
`capabilities.input`（maxImages、supportsMask、supportsReferenceVideo、supportsStartEnd）  
`capabilities.output`（supportsMulti、supportsAudio）

### 9.8 接口改造清单（只改文档所述）
- `packages/sdk/src/modules/llm/endpoints.ts` 保持为 chat 模型接口（不承载图像/视频）
- 新增 `packages/sdk/src/modules/ai/*`：图像/视频接口集中在此模块
- `contract.ts` 增加 `ai` 挂载（与 `llm` 并列）

## 十、模型类型与标注规范（用于自动过滤）
现有 `packages/api/src/common/modelTypes.ts` 需要移除图像/视频相关内容，仅保留 chat 模型定义。  
建议新增独立类型文件（例如 `packages/api/src/common/mediaModelTypes.ts`），承载图像/视频模型的标签与能力字段。

### 10.1 图像/视频模型标签建议
**基础类型标签（必选其一）：**  
- `image_generation`（图片生成）  
- `video_generation`（视频生成）

**输入能力标签（可多选）：**  
- `image_input`（支持图片输入）  
- `image_multi_input`（支持多图输入）  
- `image_edit`（支持遮罩/重绘）  
- `video_reference`（支持参考视频）  
- `video_start_end`（支持首尾帧）

**输出能力标签（可多选）：**  
- `image_multi_output`（支持多张输出）  
- `video_audio_output`（支持音频输出）

### 10.2 能力字段（强烈建议）
在模型列表返回中提供结构化能力字段，前端以此过滤：  
```json
{
  "capabilities": {
    "input": {
      "maxImages": 4,
      "supportsMask": true,
      "supportsReferenceVideo": false,
      "supportsStartEnd": false
    },
    "output": {
      "supportsMulti": true,
      "supportsAudio": false
    }
  }
}
```

### 10.3 前端过滤规则（建议）
- 遮罩输入 => 仅保留 `supportsMask = true` 的模型  
- 参考视频 => 仅保留 `supportsReferenceVideo = true` 的模型  
- 首尾帧 => 仅保留 `supportsStartEnd = true` 的模型  
- 输入图片数 > 1 => `maxImages >= 输入数` 且 `image_multi_input`  
- 生成数量 > 1 => `supportsMulti = true`；否则允许选择但由 SaaS 拆分任务补偿  
- 音频开关 => `supportsAudio = true`

### 10.4 与参数兼容策略的关系
- 标签与能力字段仅用于“可选模型过滤”  
- 参数映射与补偿（风格/反向提示词/多次任务）仍由 SaaS 侧处理

## 十、任务轮询与资源落库
- 前端持有 taskId 定时轮询服务端
- 服务端转发查询 SaaS，获取 URL
- 服务端下载 URL 内容并保存到画布资产目录
- 返回项目内路径给前端，替换 LoadingNode

## 十一、权限与错误处理
- 仅登录用户可执行生成任务
- 失败路径清晰：提交失败 / 轮询超时 / 下载失败 / 保存失败 / 取消失败
- 服务端记录 taskId、projectId、nodeId 便于追踪
- 轮询需有最大次数与退避策略
## 十二、迭代与扩展方向
- 图像角度控制、视频修改属于后续迭代
- 若未来恢复“自动推荐”或“自动选模”，可在 SaaS 层新增能力并在服务端透传
