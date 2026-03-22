# OpenLoaf 画布 V3 完整规范

> 基于 5 个 agent 对 SDK、节点、面板、基础设施、数据流的完整扫描汇总。
> 本文档是画布系统的**唯一权威规范**，所有开发必须遵循。

---

## 一、架构分层

```
┌─────────────────────────────────────────────────┐
│  Layer 1: 节点视图层 (Node View)                 │
│  ImageNode / VideoNode / AudioNode / TextNode     │
│  职责: 渲染、交互、版本堆叠 UI                     │
├─────────────────────────────────────────────────┤
│  Layer 2: AI 面板层 (Panel)                       │
│  ImageAiPanel / VideoAiPanel / AudioAiPanel        │
│  职责: Feature/Variant 选择、参数缓存、生成调度     │
├─────────────────────────────────────────────────┤
│  Layer 3: Variant 表单层 (Variant Form)           │
│  ImgGenTextVariant / ImgEditWanVariant / ...       │
│  职责: 自主组装 inputs/params、UI 表单              │
├─────────────────────────────────────────────────┤
│  Layer 4: 媒体服务层 (Media Service)              │
│  resolveAllMediaInputs / submitV3Generate          │
│  职责: 媒体上传、API 调用、任务轮询                 │
├─────────────────────────────────────────────────┤
│  Layer 5: 存储层 (Storage)                        │
│  boardPaths / Yjs / Prisma                         │
│  职责: 文件存储、文档持久化、DB 记录                │
└─────────────────────────────────────────────────┘
```

### 层间调用规则

| 调用方向 | 允许 | 禁止 |
|---------|------|------|
| L1 → L2 | 通过 props 传递 onGenerate 回调 | 节点直接调用 API |
| L2 → L3 | 传递 VariantFormProps | 面板替 variant 组装 inputs |
| L3 → L4 | 通过 onParamsChange 输出，面板统一调 L4 | variant 直接调用 API |
| L2 → L4 | buildParams() → submitV3Generate() | 面板直接操作文件系统 |
| 任意 → L5 | 仅通过 boardPaths 模块 | 直接拼路径字符串 |

---

## 二、Variant 对象模型

### 2.1 VariantDefinition 接口

```typescript
interface VariantContext {
  nodeHasImage: boolean   // 节点本身有图片
  hasImage: boolean       // 节点或上游有图片
  hasAudio: boolean       // 上游有音频
}

interface VariantDefinition {
  component: ComponentType<VariantFormProps>
  isApplicable: (ctx: VariantContext) => boolean
  isDisabled?: (ctx: VariantContext) => boolean
  maskPaint?: boolean
  maskRequired?: boolean
}
```

### 2.2 面板使用规则

1. **Feature 过滤**: 所有 variant 都 `!isApplicable` 的 feature → 隐藏 tab
2. **Variant 过滤**: `!isApplicable` 的 variant → 从下拉列表移除
3. **Smart Default**: 选第一个有 applicable variant 的 feature，第一个 applicable variant
4. **Generate 禁用**: `isDisabled?.(ctx)` 返回 true 或 `maskRequired && !maskData`

### 2.3 Variant 自主组装原则

**核心规则：每个 variant 自己决定如何使用 nodeResourcePath 和 upstream 数据组装 inputs。**

- 父组件（Panel）始终传递 `nodeResourcePath`、`upstream` 给所有 variant，零过滤
- variant 通过 `onParamsChange({ inputs, params, count?, seed? })` 输出
- 禁止在 Panel 的 `collectParams` 中注入或修改 variant 输出的 inputs
- 唯一例外：mask 数据（因为 MaskPaintOverlay 由 Panel 管理）

---

## 三、Variant IO 精确契约

### 3.1 Image Variants

#### OL-IG-001~004 (ImgGenTextVariant) — 文生图

| 字段 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| prompt | inputs | string | Y | 用户输入 + upstream.textContent |
| image | inputs | MediaInput | N | nodeResourcePath 存在时传入 |
| negativePrompt | params | string | N | OL-IG-001/003/004 支持 |
| aspectRatio | params | string | Y | 默认 "auto" |
| quality | params | string | Y | "standard" / "hd" |
| count | 顶层 | number | N | 仅 OL-IG-001/004 支持 |

**isApplicable**: `!ctx.nodeHasImage`

#### OL-IG-005/006 (ImgGenRefVariant) — 参考图生成

| 字段 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| prompt | inputs | string | Y | |
| images | inputs | MediaInput[] | N | nodeImage + upstream + manual |
| style | params | string | N | 风格前缀 |
| aspectRatio | params | string | Y | |
| quality | params | string | Y | |

**isApplicable**: `() => true`

#### OL-IE-001 (ImgEditWanVariant) — 万相编辑

| 字段 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| prompt | inputs | string | Y | |
| images | inputs | MediaInput[] | N | nodeImage + upstream + manual，normal≤4 / interleave≤1 |
| enable_interleave | params | boolean | Y | 模式切换 |
| negativePrompt | params | string | N | |

**isApplicable**: `() => true`

#### OL-IE-002 (ImgEditPlusVariant) — Plus 编辑

| 字段 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| prompt | inputs | string | Y | |
| images | inputs | MediaInput[] | Y | 必须有图，≤3 张 |
| mask | inputs | MediaInput | N | Panel 注入 |
| negativePrompt | params | string | N | |

**isApplicable**: `ctx.hasImage`
**maskPaint**: true

#### OL-IP-001 (ImgInpaintVolcVariant) — 图片修复

| 字段 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| image | inputs | MediaInput | Y | nodeResourcePath |
| mask | inputs | MediaInput | Y | Panel 注入 |
| prompt | params | string | Y | |

**isApplicable**: `ctx.hasImage`
**maskPaint**: true, **maskRequired**: true

#### OL-ST-001 (ImgStyleVolcVariant) — 风格迁移

| 字段 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| image | inputs | MediaInput | Y | 风格源图 |
| prompt | params | string | N | |
| aspectRatio | params | string | N | |
| quality | params | string | N | |

**isApplicable**: `ctx.hasImage`

#### OL-UP-001/002 (Upscale) — 超分辨率

| 字段 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| image | inputs | MediaInput | Y | nodeResourcePath |
| scale | params | number | Y | 2 或 4 |

**isApplicable**: `ctx.hasImage`

#### OL-OP-001 (OutpaintQwenVariant) — 扩图

| 字段 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| image | inputs | MediaInput | Y | nodeResourcePath |
| prompt | inputs | string | N | 默认 "扩图" |
| xScale | params | number | Y | 1.0-3.0 |
| yScale | params | number | Y | 1.0-3.0 |

**isApplicable**: `ctx.hasImage`

### 3.2 Video Variants

#### OL-VG-001/002 (VidGenQwenVariant) — 万相视频

| 字段 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| startImage | inputs | MediaInput | Y | 首帧图片 |
| prompt | inputs | string | Y | |
| style | params | string | N | |
| duration | params | number | Y | 默认 5 |
| withAudio | params | boolean | Y | 默认 true |

**isApplicable**: `ctx.hasImage`

#### OL-VG-003 (VidGenVolcVariant) — 即梦视频

| 字段 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| startImage | inputs | MediaInput | N | 可选首帧 |
| prompt | inputs | string | Y | |
| images | inputs | MediaInput[] | N | 额外参考图 |
| prompt | params | string | Y | |
| style | params | string | N | |
| aspectRatio | params | string | N | |
| duration | params | number | Y | |

**isApplicable**: `() => true`

#### OL-LS-001 (LipSyncVolcVariant) — 口型同步

| 字段 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| person | inputs | MediaInput | Y | 人物图片（仅 URL） |
| audio | inputs | MediaInput | Y | 音频（仅 URL） |

**isApplicable**: `ctx.hasImage && ctx.hasAudio`

### 3.3 Audio Variants

#### OL-TT-001 (TtsQwenVariant) — 语音合成

| 字段 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| text | inputs | string | Y | |
| voice | params | string | N | 发音人 ID |
| format | params | string | N | mp3/wav/opus |
| speechRate | params | number | N | |
| pitchRate | params | number | N | |
| volume | params | number | N | |

**isApplicable**: `() => true`

---

## 四、数据流闭环

### 4.1 生成请求闭环

```
Variant.onParamsChange()
  → { inputs, params, count?, seed? }
  → variantParamsRef.current (面板持有)
  → collectParams() 注入 mask
  → buildParams() 上传媒体 (resolveAllMediaInputs)
  → submitV3Generate()
  → POST /ai/v3/generate { feature, variant, inputs, params, count, seed, boardId, sourceNodeId }
  → { taskId }
  → pushVersion(versionStack, entry)
  → useMediaTaskPolling(taskId)
  → markVersionReady(stack, entryId, { urls })
  → onUpdate({ originalSrc, versionStack })
```

### 4.2 MediaInput 格式规范

```typescript
// 前端构造（toMediaInput）
type MediaInput = { path: string } | { url: string }

// toMediaInput 规则:
//   /^(data:|https?:|blob:)/ → { url: src }
//   其他 → { path: src }  // board-relative path

// resolveAllMediaInputs 上传规则:
//   { url: "https://..." } → 透传
//   { url: "data:..." }    → 上传 → { url: "https://..." }
//   { path: "asset/..." }  → /ai/v3/media/upload → { url: "https://..." }
```

### 4.3 上游数据传递

```
源节点 props
  → resolveUpstreamData(doc, targetNodeId)
  → UpstreamData { textList, imageList, videoList, audioList }
  → Panel 转换为 VariantUpstream { textContent, images, imagePaths }
  → Variant 自主使用
  → 生成时冻结到 InputSnapshot.upstreamRefs
```

### 4.4 版本堆叠闭环

```
生成请求
  → createInputSnapshot(params) — 冻结所有输入
  → createGeneratingEntry(input, taskId) — status: 'generating'
  → pushVersion(stack, entry) — 添加到栈
  → 轮询完成 → markVersionReady(stack, entryId, output)
  → 切换版本 → switchPrimary(stack, entryId)
  → 失败 → markVersionFailed → removeFailedEntry → 回退 primaryId
```

---

## 五、已发现问题清单（按优先级）

### P0 — 必须立即修复

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | **prompt 字段位置不一致** | ImgGenRefVariant 的 prompt 同时在 inputs 和 params | API 行为不确定 |
| 2 | **mask 注入违反分层** | Panel.collectParams() 注入 mask | 应传给 variant 自己处理 |
| 3 | **taskId 双重存储** | versionStack.entry.taskId 和 aiConfig.taskId | 不同步风险 |
| 4 | **InputSnapshot.upstreamRefs.nodeId 始终为空** | 所有流程 | 无法追溯上游来源 |

### P1 — 重构必须解决

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 5 | **ImageAiPanel 646 行过于臃肿** | ImageAiPanel.tsx | 难以维护 |
| 6 | **4 层参数缓存** | variantParamsRef + paramsCacheLocal + aiConfig.paramsCache + initialParams | 过度设计 |
| 7 | **Image/Video/Audio Panel 重复代码** | 3 个面板 | Feature 选择、variant 选择、生成调度逻辑 90% 相同 |
| 8 | **Variant 组件重复模式** | source image 解析、manual images 管理 | 应提取 useSourceImage / useMediaSlots hooks |
| 9 | **版本堆叠 UI 逻辑重复** | ImageNode / VideoNode / AudioNode | 应提取 useVersionStackToolbar hook |
| 10 | **aiConfig.feature 枚举过时** | board-contracts.ts | 包含 v2 遗留值（poster, matting, digitalHuman 等） |

### P2 — 应该清理

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 11 | **5 个 deprecated 节点类型** | FallbackNode | 可添加迁移脚本自动转换 |
| 12 | **ImagePanelMode deprecated 导出** | ImageAiPanel L52 | 死代码 |
| 13 | **VideoGenerateParams deprecated 字段** | ImageAiPanel L46-68 | prompt/aspectRatio 等已有 v3 替代 |
| 14 | **后端 resolvePayloadMediaInputs 旧逻辑** | mediaProxy.ts | 前端已全部走 path-based |
| 15 | **editingUnlockedIds 全局 Set** | ImageNode.tsx | 模块级可变状态，应改为 engine context |
| 16 | **localhost URL 处理** | media-upload.ts | deprecated 分支 |
| 17 | **Upstream images/imagePaths 双套格式** | VariantUpstream | 应统一为 imagePaths |
| 18 | **aiConfig.results vs versionStack** | board-contracts.ts | 两套多结果存储，应统一到 versionStack |

---

## 六、重构路线图

### Phase 1: 契约统一（不改 UI）

1. 统一 prompt 位置：所有 variant 的 prompt 只放 `inputs.prompt`
2. 删除 `aiConfig.taskId`（统一用 versionStack）
3. 删除 `aiConfig.results`（统一用 versionStack.output.urls）
4. 清理 `AiGenerateConfig` 枚举值（移除 v2 遗留）
5. `InputSnapshot.upstreamRefs.nodeId` 填入真实节点 ID

### Phase 2: 面板重构

1. 提取通用 `useMediaGeneration` hook（Feature/Variant 选择 + 生成调度）
2. 合并 3 个面板为 1 个 `MediaAiPanel`（通过 category 区分）
3. 参数缓存简化为 2 层：`paramsCacheLocal` (内存) + `aiConfig.paramsCache` (持久化)
4. 将 mask 数据通过 VariantFormProps 传入 variant

### Phase 3: Variant 组件优化

1. 提取 `useSourceImage(nodeResourcePath, upstream)` hook
2. 提取 `useMediaSlots(max, initial)` hook
3. 提取 `useVersionStackToolbar(stack, onUpdate)` hook

### Phase 4: 清理

1. 删除 deprecated 导出和字段
2. 删除 localhost URL 处理分支
3. 删除后端 resolvePayloadMediaInputs 旧逻辑
4. 统一 VariantUpstream 为 imagePaths only

---

## 七、API 端点速查

| 端点 | 方法 | 用途 |
|------|------|------|
| `/ai/v3/capabilities/{category}` | GET | 获取 feature/variant 列表 |
| `/ai/v3/generate` | POST | 提交生成请求 |
| `/ai/v3/task/{taskId}` | GET | 轮询任务状态 |
| `/ai/v3/task/{taskId}/cancel` | POST | 取消任务 |
| `/ai/v3/task-group/{groupId}` | GET | 查询任务组 |
| `/ai/v3/media/upload` | POST | 上传媒体（path 或 file） |

### Generate 请求格式

```json
{
  "feature": "imageGenerate",
  "variant": "OL-IG-001",
  "inputs": { "prompt": "...", "image": { "url": "https://..." } },
  "params": { "aspectRatio": "1:1", "quality": "standard" },
  "count": 1,
  "seed": 12345,
  "projectId": "proj_xxx",
  "boardId": "board_xxx",
  "sourceNodeId": "node_xxx"
}
```

### 参数合并优先级（低→高）

1. Handler 默认值
2. Variant hardcodedParams（DB/偏好配置）
3. 客户端 params（用户请求）

---

## 八、存储路径规范

### READ 操作（读已有文件）

```typescript
// 必须查 DB
const { folderUri, projectId } = await lookupBoardRecord(boardId)
const absDir = resolveBoardAbsPath(rootPath, folderUri)
```

### WRITE 操作（创建新文件）

```typescript
// 可直接拼路径
const absDir = resolveBoardDir(rootPath, boardId)
```

### 资产路径

```
{boardDir}/asset/{filename}        # 画布资产
{boardDir}/chat-history/{file}     # 聊天历史
{boardDir}/index.tnboard           # Yjs 快照
{boardDir}/index.tnboard.json      # JSON 备份
```
