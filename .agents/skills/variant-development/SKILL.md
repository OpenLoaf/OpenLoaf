---
name: variant-development
description: 开发、注册、调试画布 AI 面板中的 V3 Variant。当添加新的 AI 生成能力（如新的图片/视频/音频模型）、修改现有 variant 的输入插槽或参数、调试 variant 可见性问题、修改 AI 面板渲染逻辑时使用。即使只是"加一个新模型"、"这个 feature 为什么不显示"、"生成参数怎么传的"也应触发。
---

# Variant 开发指南

## 概念模型

画布中每个节点类型（图片/视频/音频）有自己的 AI 面板。面板内容由 **Feature → Variant** 两级结构驱动：

```
AI 面板
├── Feature Tab（如"文生图"、"超清"）    ← capabilities API 返回
│   ├── Variant A（如 OL-IG-001）       ← capabilities API 返回
│   └── Variant B（如 OL-IG-002）
└── Feature Tab（如"图片编辑"）
    └── Variant C（如 OL-IE-001）
```

**SaaS 端**定义：variant 有哪些参数（paramsSchema）、计费、显示名
**前端**定义：variant 在什么条件下可见（isApplicable）、输入插槽如何获取媒体（slots）

## 文件结构

```
apps/web/src/components/board/panels/
├── ImageAiPanel.tsx          — 图片节点 AI 面板
├── VideoAiPanel.tsx          — 视频节点 AI 面板
├── AudioAiPanel.tsx          — 音频节点 AI 面板
├── GenerateActionBar.tsx     — 生成按钮栏（含 variant 切换）
└── variants/
    ├── types.ts              — VariantDefinition、VariantContext、ParamField 类型
    ├── slot-types.ts         — AnySlot、V3InputSlotDefinition、MultiSlotDefinition
    ├── serialize.ts          — serializeForGenerate() 序列化引擎
    ├── slot-engine.ts        — restoreOrAssignV3() 插槽分配引擎
    ├── shared/
    │   ├── InputSlotBar.tsx  — 插槽 UI（接收 AnySlot[]）
    │   └── GenericVariantForm.tsx — 声明式参数表单渲染
    ├── image/index.ts        — IMAGE_VARIANTS 注册表
    ├── video/index.ts        — VIDEO_VARIANTS 注册表
    └── audio/index.ts        — AUDIO_VARIANTS 注册表
```

## 两类 Variant

这是最重要的设计规则——每个 variant 属于且仅属于两类之一：

| 类型 | 含义 | 示例 | isApplicable | slot source |
|------|------|------|-------------|------------|
| **生成类** | 创建新内容，节点自身不参与 | 文生图、文生视频、TTS | `() => true` 或 `ctx.hasImage` | `source: 'pool'` |
| **加工类** | 加工节点已有内容 | 超清、编辑、翻译、换脸 | `ctx.nodeHasImage/Video/Audio` | `source: 'self'` |

**判断方法**：如果 variant 需要"当前节点自身的媒体"作为输入 → 加工类。否则 → 生成类。

### VariantContext 六字段

```typescript
interface VariantContext {
  nodeHasImage: boolean   // 节点自身有图片（加工类图片 variant 用）
  nodeHasVideo: boolean   // 节点自身有视频（加工类视频 variant 用）
  nodeHasAudio: boolean   // 节点自身有音频（加工类音频 variant 用）
  hasImage: boolean       // 节点或上游有图片（生成类用，如图生视频）
  hasAudio: boolean       // 节点或上游有音频
  hasVideo: boolean       // 节点或上游有视频
}
```

### 各节点类型的可见性矩阵

| 节点类型 | 空节点显示 | 有内容时显示 |
|---------|-----------|-------------|
| 图片节点 | 文生图（imageGenerate） | 超清、编辑、风格迁移、修复、扩图、抠图 |
| 视频节点 | 文生视频、图生视频（上游有图时） | 口型同步、换脸、翻译、数字人 |
| 音频节点 | TTS（文字转语音） | 语音识别 |

## 注册新 Variant（步骤）

### 1. 确定类型和 isApplicable

```typescript
// 生成类 — 不需要节点自身内容
isApplicable: () => true                    // 任何时候都可见
isApplicable: (ctx) => ctx.hasImage         // 上游有图时可见（如图生视频）

// 加工类 — 需要节点自身内容
isApplicable: (ctx) => ctx.nodeHasImage     // 节点自身有图（如超清、编辑）
isApplicable: (ctx) => ctx.nodeHasVideo     // 节点自身有视频（如翻译、换脸）
isApplicable: (ctx) => ctx.nodeHasAudio     // 节点自身有音频（如语音识别）
```

### 2. 定义 slots（输入插槽）

Slots 描述 variant 需要什么输入，以及从哪里获取：

```typescript
slots: [
  // pool — 从上游连线或用户上传获取（InputSlotBar 渲染为可交互卡片）
  { key: 'prompt', accept: 'text', source: 'pool', min: 0, max: 1, referenceMode: 'inline' },
  { key: 'startFrame', accept: 'image', source: 'pool', min: 1, max: 1 },

  // self — 绑定节点自身资源（不渲染 UI，自动填充）
  { key: 'image', accept: 'image', source: 'self', hidden: true, min: 1, max: 1 },

  // paint — 画布绘制遮罩（mask 专用）
  { key: 'mask', accept: 'image', source: 'paint', min: 1, max: 1 },

  // multi — 多元素插槽
  { kind: 'multi', key: 'refs', accept: 'image', source: 'pool', min: 0, max: 3 },

  // taskRef — 引用已完成任务（视频续写等）
  { kind: 'taskRef', key: 'task_id', fromVariants: ['OL-VG-001'], required: true },
]
```

**关键规则**：
- `source: 'self'` + `min: 1` 的 variant **必须**用 `ctx.nodeHasXxx` 作为 isApplicable
- `source: 'self'` 的 slot 通常设 `hidden: true`（不在 InputSlotBar 中渲染）
- `source: 'paint'` 的 slot 对应 maskPaint 功能
- 未指定 source 默认为 `'pool'`

### 3. params（临时方案，将迁移到 SaaS 端）

> **注意**：params 最终将从 SaaS capabilities API 的 `paramsSchema` 动态获取。
> 当前阶段临时写在前端注册表中。新 variant 的 params 仍写在 index.ts，
> 但要意识到这些值将来会被 API 返回值覆盖。
> 参见 SaaS 侧 skill: `v3-params-schema-spec`

```typescript
params: [
  { key: 'duration', type: 'select', label: 'v3.fields.duration',
    options: [{ value: 5, label: '5s' }, { value: 10, label: '10s' }],
    display: 'pills', default: 5, group: 'primary' },
  { key: 'negativePrompt', type: 'text', label: 'v3.params.negativePrompt',
    default: '', group: 'advanced', multiline: true },
] satisfies ParamField[]
```

### 4. 其他字段

```typescript
'OL-XX-NNN': {
  featureId: 'videoGenerate',           // 必填，对应 capabilities API 的 feature.id
  component: MyVariantComponent,         // 可选，没有则用 GenericVariantForm
  isApplicable: (ctx) => ctx.hasImage,
  acceptsInputTypes: ['image', 'text'],  // 连线验证用
  producesOutputType: 'video',           // 输出媒体类型
  slots: [...],
  params: [...],
  maxCount: 4,                           // 单次最大生成数量
  supportsSeed: true,                    // 是否支持种子
  maskPaint: true,                       // 是否支持遮罩绘制
  maskRequired: true,                    // 遮罩是否必填
  mergeInputs: { images: ['selfImage', 'refs'] },  // 合并多个 slot 到一个 API 字段
}
```

### 5. 完整注册示例

详见 `references/variant-examples.md`。

## 序列化流程

面板点击生成时：

```
collectParams()
  → serializeForGenerate(variantDef, formState, variantId)
    → 遍历 slots: self → selfResource, paint → paintResults, pool → slotAssignments
    → 补充 prompt（如果 state.prompt 有值且 inputs.prompt 为空）
    → 应用 mergeInputs（合并多个 slot 到一个 key）
    → 遍历 params（跳过 clientOnly 和 visible=false）
    → 处理 repeatGroups
    → transformPayload 逃逸口（如有）
  → { inputs, params, count?, seed?, ticketId? }
  → submitV3Generate()
```

## 调试常见问题

| 症状 | 排查方向 |
|------|---------|
| Feature tab 不显示 | 检查该 feature 下所有 variant 的 `isApplicable` 是否都返回 false |
| Feature tab 不该显示但显示了 | 检查是否有 variant `isApplicable: () => true` 或未注册的 variant ID 被默认放行 |
| 生成按钮始终禁用 | 检查 `isGenerateDisabled`：variantDef 是否 undefined、isDisabled 是否返回 true |
| 参数未发送到 API | 检查 param 是否标了 `clientOnly: true`，或 `visible` 返回 false |
| self slot 没填充 | 确认面板 variantCtx 中对应的 `nodeHasXxx` 为 true，且 selfResource 正确传递 |
| InputSlotBar 不渲染某个 slot | self/hidden/paint/taskRef slot 被过滤不渲染，这是正常行为 |
| mergeInputs 后 key 丢失 | 检查 mergeInputs 引用的 slot key 是否在 slots 中存在 |
| 未注册 variant 的 isApplicable | 返回 false（安全默认值），不会显示 |

## 检查清单

新增或修改 variant 时，逐项确认：

- [ ] `featureId` 与 capabilities API 返回的 feature.id 一致
- [ ] `isApplicable` 使用正确的 context 字段（生成类 vs 加工类）
- [ ] 有 `source: 'self'` + `min: 1` 的 slot → isApplicable 用 `nodeHasXxx`
- [ ] 有 `source: 'paint'` 的 slot → 设置了 `maskPaint: true`
- [ ] `maskRequired: true` 时 paint slot 的 `min: 1`
- [ ] select 类型 param 有 `options` 或 `catalog`
- [ ] slider/number 的 min/max 与 SaaS handler 的 inputSchema 一致
- [ ] `acceptsInputTypes` 覆盖了所有 pool slot 的 accept 类型
- [ ] `producesOutputType` 正确
- [ ] 类型检查通过（`npx tsc --noEmit --project apps/web/tsconfig.json`）
- [ ] 测试通过（`pnpm --filter web exec vitest run --config vitest.config.ts "variants/__tests__"`)
