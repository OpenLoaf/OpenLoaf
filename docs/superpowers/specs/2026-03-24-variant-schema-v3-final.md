# Variant Schema V3 — 最终设计方案

> 日期：2026-03-24
> 状态：Final
> 范围：前端 `apps/web/.../variants/` + SaaS `apps/server/.../v3/handlers/`
> 前置：V2 方案审查 + Kling API 压测 + 5 个审查 agent 反馈

---

## 一、设计原则

1. **渐进式复杂度**：简单 variant 只用 `slots` + `params`，复杂场景按需启用高级能力
2. **pool/self/paint 三源保留**：解决"节点自身图 vs 上游参考图"的核心问题
3. **前后端联动**：SaaS 侧统一 API 契约，前端按约定直传，无需 apiMapping
4. **声明即规则**：一个 VariantDefinition 完整描述输入、参数、序列化
5. **逃逸口**：`customComponent` + `transformPayload` 处理声明式无法覆盖的场景

---

## 二、完整类型定义

```typescript
// ================================================================
// 基础类型
// ================================================================

type MediaType = 'image' | 'video' | 'audio' | 'text'
type SlotSource = 'pool' | 'self' | 'paint'

/** visible/disabled 的上下文 — 可访问参数 + 插槽状态 */
interface ResolveContext {
  params: Record<string, unknown>
  variantId: string
  /** 每个插槽是否有内容：slotKey → boolean */
  slots: Record<string, boolean>
  /** 互斥模式组的当前选中值：modeGroupKey → modeValue */
  modes: Record<string, string>
}

// ================================================================
// Layer 1: 输入插槽
// ================================================================

/** 单值/固定容量插槽 */
interface InputSlotDefinition {
  /** 插槽 ID，同时作为 API inputs 的 key */
  key: string
  /** i18n key */
  label: string
  /** 接受的媒体类型 */
  accept: MediaType
  /** 内容来源（默认 'pool'） */
  source?: SlotSource
  /** 0=可选, 1+=必填（默认 0） */
  min?: number
  /** 最大数量（默认 1） */
  max?: number
  /** 是否允许手动上传（仅 pool 有效，默认 true） */
  allowUpload?: boolean
  /** 是否隐藏不渲染（self 插槽常用） */
  hidden?: boolean
  /** 文本插槽专用 */
  referenceMode?: 'inline' | 'replace'
  /** 条件可见 */
  visible?: (ctx: ResolveContext) => boolean
}

/** 多元素插槽 — 接收 N 个同类媒体，带编号引用 */
interface MultiSlotDefinition extends Omit<InputSlotDefinition, 'max'> {
  kind: 'multi'
  max: number
  /** prompt 中的引用前缀，如 '@image' → @image_1, @image_2 */
  refPrefix?: string
}

/** 任务引用插槽 — 引用已完成的生成任务 ID */
interface TaskRefSlot {
  kind: 'taskRef'
  key: string
  label: string
  /** 限制可引用的 variant ID 列表 */
  fromVariants?: string[]
  required?: boolean
}

type AnySlot = InputSlotDefinition | MultiSlotDefinition | TaskRefSlot

// ================================================================
// Layer 2: 参数字段
// ================================================================

interface ParamOption {
  value: string | number | boolean
  label: string
  /** 缩略图 URL，用于可视化选项（如风格选择器） */
  thumbnail?: string
}

interface ParamFieldBase {
  key: string
  label: string
  default?: unknown
  /** primary = 始终显示, advanced = 折叠面板内 */
  group?: 'primary' | 'advanced'
  /** 条件可见（可访问 params + slots 状态） */
  visible?: (ctx: ResolveContext) => boolean
  /** 仅前端使用，不发送到 API（如 ASR 的 duration 模式选择） */
  clientOnly?: boolean
  /** 提示文案 */
  hint?: string
}

interface SelectField extends ParamFieldBase { type: 'select'; options: ParamOption[] }
interface BooleanField extends ParamFieldBase { type: 'boolean' }
interface TextField extends ParamFieldBase { type: 'text'; multiline?: boolean; placeholder?: string }
interface SliderField extends ParamFieldBase { type: 'slider'; min: number; max: number; step?: number }
interface NumberField extends ParamFieldBase { type: 'number'; min?: number; max?: number; step?: number }

type ParamField = SelectField | BooleanField | TextField | SliderField | NumberField

// ================================================================
// Layer 3: 高级能力（按需启用）
// ================================================================

/** 互斥输入模式 — 用户在 N 种输入方式中选一种 */
interface InputModeGroup {
  key: string
  label?: string
  defaultMode?: string
  modes: InputMode[]
}

interface InputMode {
  value: string
  label: string
  /** 该模式下的额外插槽 */
  slots?: AnySlot[]
  /** 该模式下的额外参数 */
  params?: ParamField[]
}

/** 动态重复组 — 可变长度的结构化列表 */
interface RepeatGroup {
  key: string
  label: string
  min: number
  max: number
  /** 每项包含的字段模板 */
  fields: ParamField[]
  /**
   * API 字段名模板，{i} 替换为从 1 开始的序号
   * 如 'shot_{i}_prompt' → shot_1_prompt, shot_2_prompt
   * 不指定则发送为 key: Array<Record<fieldKey, value>>
   */
  apiKeyTemplate?: string
}

// ================================================================
// VariantDefinition — 完整定义
// ================================================================

interface VariantDefinition {
  /** Variant ID（如 'OL-IG-001'） */
  id?: string
  /** Feature ID（如 'imageGenerate'） */
  featureId?: string
  /** 显示名 */
  label?: string

  // ---- 适用性 ----
  isApplicable: (ctx: VariantContext) => boolean
  isDisabled?: (ctx: VariantContext) => boolean
  acceptsInputTypes?: MediaType[]
  producesOutputType?: MediaType

  // ---- 输入声明（简单场景） ----
  slots?: AnySlot[]
  params?: ParamField[]

  // ---- 高级输入（按需启用） ----
  inputModes?: InputModeGroup[]
  repeatGroups?: RepeatGroup[]

  // ---- 请求级参数 ----
  maxCount?: number
  defaultCount?: number
  supportsSeed?: boolean

  // ---- 序列化 ----
  /**
   * 多个插槽合并到同一 API inputs 字段。
   * 例: { images: ['image', 'refs'] } → inputs.images = [self图, pool图]
   * 仅用于简单合并。互斥场景用 inputModes。
   */
  mergeInputs?: Record<string, string[]>

  /**
   * 提交前的最终变换（逃逸口）。
   * 当框架默认的 key→value 直映射不够时使用。
   * 如 Kling 多镜头需要展平 shot_{i}_prompt。
   */
  transformPayload?: (raw: RawPayload) => Record<string, unknown>

  // ---- 自定义渲染（逃逸口） ----
  customComponent?: ComponentType<CustomParamProps>
}

interface RawPayload {
  prompt?: string
  slots: Record<string, MediaInput | MediaInput[]>
  params: Record<string, unknown>
  taskRefs: Record<string, string>
  repeatGroups: Record<string, Record<string, unknown>[]>
  modes: Record<string, string>
  count?: number
  seed?: number
}
```

---

## 三、SlotSource 行为规则（保留 V2 核心）

| Source | 含义 | nodeResource 入池？ | 持久化方式 |
|--------|------|-------------------|-----------|
| `pool`（默认） | 从上游引用池自动分配 | 无 self 时入池 | slotAssignment[key] |
| `self` | 绑定当前节点资源 | **不入池** | 不持久化（始终最新） |
| `paint` | 画布绘制（遮罩） | 不入池 | `paint:asset/path` |

- 存在 `self` 插槽 → nodeResource 不入池 → pool 插槽不会意外获得节点自身图
- `paint` 插槽只在节点有图片时显示
- 缓存恢复：**按插槽独立验证**，manual 引用始终有效

---

## 四、ResolveContext — 解决 visible() 的能力不足

```typescript
// 所有 visible() 函数都接收 ResolveContext
visible: (ctx) => {
  // 访问参数值
  ctx.params.format === 'opus'

  // 访问插槽填充状态（解决问题 6）
  ctx.slots.refImage === true

  // 访问互斥模式选择（解决问题 4）
  ctx.modes.audioSource === 'tts'

  // 访问 variant ID
  ctx.variantId === 'OL-IG-005'
}
```

---

## 五、完整示例

### 5.1 简单文生图 — OL-IG-001

```typescript
{
  featureId: 'imageGenerate',
  isApplicable: (ctx) => !ctx.hasImage,
  producesOutputType: 'image',
  maxCount: 4,
  supportsSeed: true,

  slots: [
    { key: 'prompt', accept: 'text', label: 'slot.prompt',
      source: 'pool', min: 0, max: 1, referenceMode: 'inline' },
  ],

  params: [
    { key: 'promptExtend', type: 'boolean', label: 'params.promptExtend',
      default: true, group: 'primary' },
    { key: 'negativePrompt', type: 'text', label: 'params.negativePrompt',
      default: '', group: 'advanced' },
    { key: 'watermark', type: 'boolean', label: 'params.watermark',
      default: false, group: 'advanced' },
  ],
}
```

**零高级能力，和 V2 一样简洁。**

### 5.2 图片修复 — OL-IP-001（self + paint）

```typescript
{
  featureId: 'imageInpaint',
  isApplicable: (ctx) => ctx.nodeHasImage,
  producesOutputType: 'image',

  slots: [
    { key: 'mask',   accept: 'image', label: 'slot.mask',
      source: 'paint', min: 1, max: 1 },
    { key: 'image',  accept: 'image', label: 'slot.sourceImage',
      source: 'self', min: 1, max: 1, hidden: true },
    { key: 'prompt', accept: 'text',  label: 'slot.prompt',
      source: 'pool', min: 0, max: 1, referenceMode: 'inline' },
  ],
}
```

### 5.3 图片编辑 — OL-IE-001（self + pool + paint + mergeInputs）

```typescript
{
  featureId: 'imageEdit',
  isApplicable: (ctx) => ctx.hasImage,
  producesOutputType: 'image',
  maxCount: 6,
  supportsSeed: true,

  slots: [
    { key: 'mask',   accept: 'image', label: 'slot.mask',
      source: 'paint', min: 0, max: 1 },
    { key: 'image',  accept: 'image', label: 'slot.sourceImage',
      source: 'self', min: 1, max: 1, hidden: true },
    { key: 'prompt', accept: 'text',  label: 'slot.prompt',
      source: 'pool', min: 1, max: 1, referenceMode: 'inline' },
    { key: 'refs',   accept: 'image', label: 'slot.referenceImages',
      source: 'pool', min: 0, max: 2 },
  ],

  mergeInputs: { images: ['image', 'refs'] },

  params: [
    { key: 'size', type: 'select', label: 'params.size', default: 'auto',
      group: 'primary',
      options: [
        { value: 'auto', label: 'params.size.auto' },
        { value: '1024*1024', label: 'params.size.1024' },
      ] },
    { key: 'promptExtend', type: 'boolean', label: 'params.promptExtend',
      default: true, group: 'primary' },
  ],
}
```

### 5.4 Kling 图生视频 — 首帧 + 尾帧（问题 1）

```typescript
{
  featureId: 'videoGenerate',
  isApplicable: (ctx) => ctx.hasImage,
  producesOutputType: 'video',
  supportsSeed: true,

  slots: [
    { key: 'prompt',     accept: 'text',  label: 'slot.prompt',
      source: 'pool', min: 0, max: 1, referenceMode: 'inline' },
    { key: 'image',      accept: 'image', label: 'slot.startFrame',
      source: 'pool', min: 1, max: 1 },
    { key: 'image_tail', accept: 'image', label: 'slot.endFrame',
      source: 'pool', min: 0, max: 1 },
  ],

  params: [
    { key: 'model_name', type: 'select', label: 'params.model', default: 'kling-v3-0',
      group: 'primary',
      options: [
        { value: 'kling-v3-0', label: 'Kling v3.0' },
        { value: 'kling-v2-6', label: 'Kling v2.6' },
      ] },
    { key: 'duration', type: 'slider', label: 'params.duration',
      default: 5, min: 3, max: 15, step: 1, group: 'primary' },
    { key: 'enable_audio', type: 'boolean', label: 'params.enableAudio',
      default: true, group: 'primary' },
    { key: 'cfg_scale', type: 'slider', label: 'params.cfgScale',
      default: 0.5, min: 0, max: 1, step: 0.1, group: 'advanced',
      visible: (ctx) => !['kling-v2-5','kling-v2-6','kling-v3-0']
        .includes(ctx.params.model_name as string) },
  ],
}
```

**两个独立的 image 插槽，key 直接对应 Kling API 字段。**

### 5.5 Kling Omni — 多元素引用（问题 2）

```typescript
{
  featureId: 'videoGenerate',
  isApplicable: () => true,
  producesOutputType: 'video',

  slots: [
    { key: 'prompt', accept: 'text', label: 'slot.prompt',
      source: 'pool', min: 1, max: 1, referenceMode: 'inline' },
    { kind: 'multi', key: 'images', accept: 'image', label: 'slot.elements',
      source: 'pool', min: 0, max: 7, refPrefix: '@image' },
  ],

  params: [
    { key: 'omni_version', type: 'select', label: 'params.version', default: 'v3',
      group: 'primary',
      options: [{ value: 'o1', label: 'O1' }, { value: 'v3', label: 'V3' }] },
    { key: 'duration', type: 'slider', label: 'params.duration',
      default: 5, min: 3, max: 15, step: 1, group: 'primary' },
    { key: 'aspect_ratio', type: 'select', label: 'params.aspectRatio', default: '16:9',
      group: 'primary',
      options: [
        { value: '16:9', label: '16:9' },
        { value: '9:16', label: '9:16' },
        { value: '1:1', label: '1:1' },
      ] },
  ],
}
```

**`refPrefix: '@image'` 让前端 prompt 编辑器为已填充的媒体生成 `@image_1` ~ `@image_N` 标签。**

### 5.6 Kling v3 多镜头（问题 3）

```typescript
{
  featureId: 'videoGenerate',
  isApplicable: () => true,
  producesOutputType: 'video',

  slots: [
    { key: 'image', accept: 'image', label: 'slot.startFrame',
      source: 'pool', min: 0, max: 1 },
  ],

  repeatGroups: [
    {
      key: 'shots',
      label: 'params.shots',
      min: 2,
      max: 6,
      apiKeyTemplate: 'shot_{i}',
      fields: [
        { key: 'prompt', type: 'text', label: 'params.shotPrompt', multiline: true },
        { key: 'duration', type: 'number', label: 'params.shotDuration',
          min: 1, max: 10, default: 3 },
      ],
    },
  ],

  transformPayload: (raw) => {
    const payload: Record<string, unknown> = {}
    if (raw.slots.image) payload.image = raw.slots.image
    if (raw.prompt) payload.prompt = raw.prompt
    for (const [i, shot] of raw.repeatGroups.shots.entries()) {
      payload[`shot_${i + 1}_prompt`] = shot.prompt
      payload[`shot_${i + 1}_duration`] = shot.duration
    }
    Object.assign(payload, raw.params)
    return payload
  },
}
```

### 5.7 Kling Avatar — 互斥音源（问题 4）

```typescript
{
  featureId: 'digitalHuman',
  isApplicable: (ctx) => ctx.hasImage,
  producesOutputType: 'video',

  slots: [
    { key: 'imageUrl', accept: 'image', label: 'slot.personImage',
      source: 'self', min: 1, max: 1, hidden: true },
  ],

  inputModes: [
    {
      key: 'audioSource',
      label: 'mode.audioSource',
      defaultMode: 'upload',
      modes: [
        {
          value: 'upload',
          label: 'mode.uploadAudio',
          slots: [
            { key: 'audioUrl', accept: 'audio', label: 'slot.audio',
              source: 'pool', min: 1, max: 1 },
          ],
        },
        {
          value: 'tts',
          label: 'mode.ttsAudio',
          params: [
            { key: 'text', type: 'text', label: 'params.ttsText', multiline: true },
            { key: 'speakerId', type: 'select', label: 'params.speaker',
              options: [/* 从 API 动态加载 */] },
            { key: 'speed', type: 'slider', label: 'params.speed',
              min: 0.8, max: 2.0, step: 0.1, default: 1.0 },
          ],
        },
      ],
    },
  ],

  params: [
    { key: 'mode', type: 'select', label: 'params.quality', default: 'std',
      group: 'primary',
      options: [
        { value: 'std', label: 'Standard' },
        { value: 'pro', label: 'Pro' },
      ] },
  ],
}
```

### 5.8 Kling 视频续写 — 任务引用（问题 5）

```typescript
{
  featureId: 'videoExtend',
  isApplicable: () => true,
  producesOutputType: 'video',

  slots: [
    { key: 'prompt', accept: 'text', label: 'slot.prompt',
      source: 'pool', min: 0, max: 1, referenceMode: 'inline' },
    { kind: 'taskRef', key: 'task_id', label: 'slot.sourceTask',
      fromVariants: ['kling-t2v', 'kling-i2v', 'kling-video-extend'],
      required: true },
  ],

  params: [
    { key: 'enable_audio', type: 'boolean', label: 'params.enableAudio',
      default: false, group: 'primary' },
  ],
}
```

### 5.9 VideoRetalk — visible 访问插槽（问题 6）

```typescript
{
  featureId: 'lipSync',
  isApplicable: (ctx) => ctx.hasVideo && ctx.hasAudio,
  producesOutputType: 'video',

  slots: [
    { key: 'video',    accept: 'video', label: 'slot.video',
      source: 'pool', min: 1, max: 1 },
    { key: 'audio',    accept: 'audio', label: 'slot.audio',
      source: 'pool', min: 1, max: 1 },
    { key: 'refImage', accept: 'image', label: 'slot.refFaceImage',
      source: 'pool', min: 0, max: 1 },
  ],

  params: [
    { key: 'videoExtension', type: 'boolean', label: 'params.videoExtension',
      default: false, group: 'advanced' },
    { key: 'queryFaceThreshold', type: 'slider', label: 'params.faceThreshold',
      min: 120, max: 200, step: 1, default: 170, group: 'advanced',
      // ✅ 现在可以访问插槽状态
      visible: (ctx) => ctx.slots.refImage === true },
  ],
}
```

### 5.10 volc-jimeng-t2v — inputModes 替代优先级（问题 7）

```typescript
{
  featureId: 'videoGenerate',
  isApplicable: () => true,
  producesOutputType: 'video',
  supportsSeed: true,

  slots: [
    { key: 'prompt', accept: 'text', label: 'slot.prompt',
      source: 'pool', min: 1, max: 1, referenceMode: 'inline' },
  ],

  inputModes: [
    {
      key: 'imageInput',
      label: 'mode.imageInput',
      defaultMode: 'none',
      modes: [
        { value: 'none', label: 'mode.textOnly' },
        {
          value: 'startFrame',
          label: 'mode.startFrame',
          slots: [
            { key: 'startImage', accept: 'image', label: 'slot.startFrame',
              source: 'pool', min: 1, max: 1 },
          ],
        },
        {
          value: 'refs',
          label: 'mode.referenceImages',
          slots: [
            { kind: 'multi', key: 'images', accept: 'image', label: 'slot.referenceImages',
              source: 'pool', min: 1, max: 3 },
          ],
        },
      ],
    },
  ],

  params: [
    { key: 'duration', type: 'select', label: 'params.duration', default: 5,
      group: 'primary',
      options: [{ value: 5, label: '5s' }, { value: 10, label: '10s' }] },
    { key: 'style', type: 'select', label: 'params.style', default: '',
      group: 'primary',
      options: [{ value: '', label: 'None' }, { value: '3D', label: '3D' }] },
    { key: 'aspectRatio', type: 'select', label: 'params.aspectRatio', default: '16:9',
      group: 'primary',
      options: [
        { value: '16:9', label: '16:9' },
        { value: '9:16', label: '9:16' },
        { value: '1:1', label: '1:1' },
      ] },
  ],
}
```

### 5.11 ASR — clientOnly 参数（问题 8）

```typescript
{
  featureId: 'speechToText',
  isApplicable: (ctx) => ctx.hasAudio,
  producesOutputType: 'text',

  slots: [
    { key: 'audio', accept: 'audio', label: 'slot.audio',
      source: 'pool', min: 1, max: 1 },
  ],

  params: [
    { key: 'audioMode', type: 'select', label: 'params.audioMode', default: 'short',
      group: 'primary', clientOnly: true,
      options: [
        { value: 'short', label: 'params.audioMode.short' },
        { value: 'long', label: 'params.audioMode.long' },
      ] },
    { key: 'language', type: 'select', label: 'params.language',
      group: 'primary', options: [
        { value: 'zh', label: '中文' },
        { value: 'en', label: 'English' },
      ] },
    { key: 'enableItn', type: 'boolean', label: 'params.enableItn', default: false,
      group: 'advanced',
      visible: (ctx) => ['zh', 'en'].includes(ctx.params.language as string) },
  ],
}
```

---

## 六、渲染规则

```
┌─ GenericVariantForm ─────────────────────────────────┐
│                                                       │
│  1. [InputSlotBar]  — 渲染顶层 slots                  │
│     self(hidden) / paint(chip) / pool(MediaSlot)      │
│                                                       │
│  2. [InputModeSelector]  — 若有 inputModes            │
│     Tab/Radio 切换，选中 mode 的 slots + params 显示    │
│                                                       │
│  3. [RepeatGroupEditor]  — 若有 repeatGroups           │
│     可增减的表单列表（如多镜头）                         │
│                                                       │
│  4. [TaskRefSelector]  — 若有 taskRef 插槽             │
│     从画布历史中选择已完成任务                           │
│                                                       │
│  5. [Primary Params]  — group='primary' 的参数         │
│                                                       │
│  6. [Custom Component]  — customComponent（如有）       │
│                                                       │
│  7. [▸ Advanced]  — group='advanced' 的参数（折叠）     │
│                                                       │
└───────────────────────────────────────────────────────┘
┌─ GenerateActionBar ──────────────────────────────────┐
│  [Count: ×1 ▼]  [Seed: 🎲]  [======== 生成 ========] │
└───────────────────────────────────────────────────────┘
```

**简单 variant**（文生图/超分）只触发 1 + 5，零额外 UI。

---

## 七、序列化规则

```typescript
function serializeForGenerate(def: VariantDefinition, state: FormState): V3GenerateRequest {
  const inputs: Record<string, unknown> = {}
  const params: Record<string, unknown> = {}

  // 1. slots → inputs（按 key 直映射）
  for (const slot of allActiveSlots(def, state.modes)) {
    if (slot.kind === 'taskRef') {
      inputs[slot.key] = state.taskRefs[slot.key]
      continue
    }
    if (slot.source === 'self') {
      inputs[slot.key] = toMediaInput(state.selfResource)
      continue
    }
    if (slot.source === 'paint' && state.paintResults[slot.key]) {
      inputs[slot.key] = toMediaInput(state.paintResults[slot.key])
      continue
    }
    // pool slots
    const refs = state.slotAssignments[slot.key]
    if (slot.kind === 'multi' || (slot.max ?? 1) > 1) {
      inputs[slot.key] = refs.map(r => toMediaInput(r))
    } else if (refs[0]) {
      inputs[slot.key] = toMediaInput(refs[0])
    }
  }

  // 2. mergeInputs
  if (def.mergeInputs) {
    for (const [target, sources] of Object.entries(def.mergeInputs)) {
      const merged = sources.flatMap(s => {
        const v = inputs[s]; delete inputs[s]
        return Array.isArray(v) ? v : v ? [v] : []
      })
      if (merged.length) inputs[target] = merged
    }
  }

  // 3. params → params（跳过 clientOnly）
  for (const field of allActiveParams(def, state.modes)) {
    if (field.clientOnly) continue
    if (field.visible && !field.visible(buildCtx(state))) continue
    params[field.key] = state.params[field.key]
  }

  // 4. repeatGroups
  if (def.repeatGroups) {
    for (const rg of def.repeatGroups) {
      if (rg.apiKeyTemplate) {
        // 展平：shot_{i}_prompt → shot_1_prompt
        for (const [i, item] of state.repeatGroups[rg.key].entries()) {
          for (const [k, v] of Object.entries(item)) {
            params[rg.apiKeyTemplate.replace('{i}', String(i + 1)) + '_' + k] = v
          }
        }
      } else {
        params[rg.key] = state.repeatGroups[rg.key]
      }
    }
  }

  // 5. transformPayload（逃逸口）
  if (def.transformPayload) {
    return def.transformPayload({ prompt: state.prompt, slots: inputs, params, ... })
  }

  return { inputs, params, count: state.count, seed: state.seed }
}
```

---

## 八、SaaS 侧改造清单（不变）

| 改动 | 影响范围 |
|------|---------|
| 4 个 Volc handler: `params.prompt` → `inputs.prompt` | 1 行 × 4 |
| 所有 handler: `params.count` → `input.count` | 多个 handler |
| HandlerInput 新增 `count?: number` | types.ts |
| 建议：各 handler 添加 Zod inputSchema | 可选 |

---

## 九、能力覆盖矩阵

| 场景 | 解决机制 | 示例 |
|------|---------|------|
| 纯文生图 | slots + params | OL-IG-001 |
| 超分/扩图 | slots(self) + params | OL-UP-001 |
| 图片编辑+遮罩 | slots(self+paint+pool) + mergeInputs | OL-IE-001 |
| 首帧+尾帧 | 两个独立 slots | Kling I2V |
| 多元素引用 | MultiSlotDefinition + refPrefix | Kling Omni |
| 多镜头 | RepeatGroup + apiKeyTemplate | Kling v3 |
| 互斥音源 | InputModeGroup | Kling Avatar |
| 互斥图片输入 | InputModeGroup | volc-jimeng-t2v |
| 任务引用 | TaskRefSlot | Kling 视频续写 |
| 参数依赖插槽 | visible(ctx.slots) | VideoRetalk |
| 仅前端参数 | clientOnly: true | ASR duration |
| 复杂序列化 | transformPayload | Kling 多镜头展平 |
| 复杂 UI | customComponent | TTS 语音试听 |
