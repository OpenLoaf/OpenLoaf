# Variant Schema V2 — 声明式变体系统重构（最终版）

> 日期：2026-03-24
> 状态：Final Draft
> 范围：前端 `apps/web/.../variants/` + SaaS `apps/server/.../v3/handlers/`

---

## 一、问题总结

经过 5 个审查 agent 全面分析，当前系统存在 **8 个结构性问题**：

| # | 问题 | 根因 | 影响 |
|---|------|------|------|
| 1 | 缓存恢复全量废弃 | restoreOrAssign 对必填插槽做全有效/全无效判定 | 手动上传丢失 |
| 2 | 无参数 Schema | 18 个 variant 各自 useState | 与 SaaS handler 参数不对齐 |
| 3 | 无输入来源区分 | 所有媒体进入同一 pool | 节点自身图混入参考插槽 |
| 4 | Mask 游离于体系外 | 独立 props 链，不持久化 | 关闭面板/切换 variant 后遮罩丢失 |
| 5 | Prompt 位置不统一（SaaS） | Qwen 用 `inputs.prompt`，Volc 用 `params.prompt` | 前端映射混乱 |
| 6 | Count/N 命名混乱 | 前端 n/count，handler params.count | 序列化不一致 |
| 7 | 缺失参数 | watermark/duration/style 等未从 handler 暴露到前端 | 功能缺失 |
| 8 | InputSnapshot 不完整 | 不存储 featureId/variantId/slotAssignment | 重试/回溯丢失上下文 |

**核心洞察**：问题 5、6、7 的根因在 SaaS 侧 handler 不统一。如果后端统一了参数契约，前端就不需要复杂的 apiMapping。

---

## 二、最优方案：前后端联动统一

### 2.1 核心原则

```
前端不做参数路径映射。SaaS 侧统一契约，前端按约定直传。
```

**之前的思路**：前端 schema 定义 `apiMapping.mergeSlots`，序列化时做路径转换。
**现在的思路**：SaaS handler 全部遵守同一套参数结构，前端只需**声明 + 直传**。

### 2.2 统一 API 契约（SaaS 侧改造）

```typescript
// SaaS: v3Routes.ts 接收的请求体
interface V3GenerateRequest {
  feature: string           // "imageGenerate" | "imageEdit" | ...
  variant: string           // variantId
  inputs: {                 // 媒体输入（始终在 inputs 下）
    prompt?: string         // 文本提示词（所有 handler 统一从这里读）
    text?: string           // TTS 文本（音频专用）
    image?: MediaInput      // 单张图片
    images?: MediaInput[]   // 多张图片
    mask?: MediaInput       // 遮罩
    video?: MediaInput      // 视频
    audio?: MediaInput      // 音频
    startImage?: MediaInput // 首帧（视频生成）
  }
  params: {                 // 控制参数（始终在 params 下）
    negativePrompt?: string
    promptExtend?: boolean
    aspectRatio?: string
    size?: string
    resolution?: string
    quality?: string
    watermark?: boolean
    duration?: number
    style?: string
    // ...其他 variant 特有参数
  }
  count?: number            // 请求级：生成数量
  seed?: number             // 请求级：随机种子
}
```

**SaaS 侧需要改的**：
1. `volc-jimeng-inpaint.ts`：`input.params.prompt` → `input.inputs.prompt`
2. `volc-jimeng-t2v.ts`：`input.params.prompt` → `input.inputs.prompt`
3. 所有 handler：`params.count` / `params.n` → 从请求顶层 `count` 读取
4. 所有 handler 添加 Zod `inputSchema` 验证

这样**前端不需要 apiMapping**，直传即可。

---

## 三、前端 Schema 设计

### 3.1 Layer 1：InputSlotDefinition（增强版）

```typescript
type SlotSource = 'pool' | 'self' | 'paint'

interface InputSlotDefinition {
  /** 插槽 ID，同时作为 API inputs 的 key */
  id: string
  /** 'image' | 'video' | 'audio' | 'text' */
  mediaType: MediaType
  /** i18n key */
  labelKey: string
  /** 0=可选, 1+=必填 */
  min: number
  /** 最大数量 */
  max: number

  /** 内容来源 */
  source: SlotSource
  /** 是否允许手动上传（仅 pool 有效，默认 true） */
  allowManualUpload?: boolean
  /** 是否隐藏不渲染（self 插槽常用） */
  hidden?: boolean
  /** 文本插槽专用 */
  referenceMode?: 'inline' | 'replace'
}
```

**废弃**：`overflowStrategy`、`isPaintable`、`allowManualInput`。

#### SlotSource 行为规则

| Source | nodeResource 入池？ | 自动分配？ | 手动上传？ | 持久化方式 |
|--------|-------------------|-----------|-----------|-----------|
| `pool` | 见下方规则 | 从池分配 | 允许 | slotAssignment[id] = nodeId \| manual:path |
| `self` | **不入池** | 绑定 nodeResource | 不允许 | 不持久化（来自节点属性，始终最新） |
| `paint` | 不入池 | 不分配 | 不允许 | 独立存储为 asset 文件，path 存入 slotAssignment |

**nodeResource 入池规则**：
- 存在 `self` 插槽 → nodeResource **不入池**（绑定到 self）
- 不存在 `self` 插槽 → nodeResource **入池**（作为最高优先级引用）

### 3.2 Layer 2：ParamField（参数声明）

```typescript
type ParamFieldType = 'select' | 'boolean' | 'text' | 'slider'

interface ParamOption {
  value: string | number | boolean
  labelKey: string
  /** 图片 URL，用于 style 选择器等可视化选项 */
  thumbnailUrl?: string
}

interface ParamField {
  /** 参数 ID，直接作为 params[id] 发送（因为后端统一，无需映射） */
  id: string
  type: ParamFieldType
  labelKey: string
  default: unknown

  // 类型特定
  options?: ParamOption[]       // select
  min?: number                  // slider
  max?: number                  // slider
  step?: number                 // slider
  placeholder?: string          // text

  // 显示控制
  group?: 'primary' | 'advanced'
  /** 动态可见性。参数包含当前所有参数值 + __variantId。
   *  隐藏的参数不发送到 API。 */
  visible?: (ctx: { params: Record<string, unknown>; variantId: string }) => boolean
}
```

**审查反馈修复**：
- `visible()` 现在接收 `variantId`（解决 FIELD_CONFIG 按 variant 控制可见性的需求）
- 新增 `thumbnailUrl`（解决风格选择器需要图片预览的需求）

### 3.3 Layer 3：VariantDefinition（增强版）

```typescript
interface VariantDefinition {
  featureId?: string
  isApplicable: (ctx: VariantContext) => boolean
  isDisabled?: (ctx: VariantContext) => boolean
  acceptsInputTypes?: MediaType[]
  producesOutputType?: MediaType

  // ===== 输入 Schema =====
  inputSlots: InputSlotDefinition[]

  // ===== 参数 Schema =====
  /** 声明式参数，由 GenericParamForm 自动渲染 */
  paramFields?: ParamField[]
  /** 自定义参数组件（用于 TTS 语音试听等复杂交互） */
  customParamComponent?: ComponentType<CustomParamProps>

  // ===== 请求级参数 =====
  maxCount?: number       // 最大生成数量（默认 1，>1 时框架显示选择器）
  defaultCount?: number
  supportsSeed?: boolean  // 是否支持自定义种子

  // ===== 序列化 =====
  /** 当多个插槽需要合并到同一 API 字段时声明。
   *  例: { 'images': ['image', 'refs'] } → inputs.images = [self的image, pool的refs] */
  mergeInputs?: Record<string, string[]>
}
```

**关键变更**（相比 V1 草案）：
1. **移除 `apiMapping`** — 因为 SaaS 侧统一了，不需要路径映射
2. **保留 `mergeInputs`** — 唯一需要前端处理的：多个插槽合并到一个 API 字段
3. **`component` 废弃** → 拆为 `paramFields`（通用）+ `customParamComponent`（逃逸口）
4. **`customParamComponent`** 接收 `CustomParamProps`（不是完整的 VariantFormProps）

```typescript
/** 自定义参数组件的 props（比 VariantFormProps 更精简） */
interface CustomParamProps {
  variantId: string
  disabled: boolean
  /** 当前所有参数值（包括 paramFields 和自定义的） */
  params: Record<string, unknown>
  /** 修改单个参数 */
  onParamChange: (id: string, value: unknown) => void
  /** 初始参数（用于恢复） */
  initialParams?: Record<string, unknown>
}
```

---

## 四、引擎改造

### 4.1 buildReferencePools — 感知 self 插槽

```typescript
function buildReferencePools(
  upstream: UpstreamData,
  fileContext: BoardFileContext | undefined,
  nodeResource: { ... } | undefined,
  slots: InputSlotDefinition[],
): ReferencePools {
  const pools = { text: [], image: [], video: [], audio: [] }

  // 1. 上游条目 → 入池（不变）
  for (const entry of upstream.entries) { ... }

  // 2. nodeResource 处理（新逻辑）
  const hasSelfSlot = slots.some(s => s.source === 'self')
  if (nodeResource && !hasSelfSlot) {
    // 无 self → nodeResource 入池
    pools[mediaType].unshift(nodeResourceRef)
  }
  // 有 self → 不入池（由框架单独绑定到 self 插槽）

  return pools
}
```

### 4.2 restoreOrAssign — 按插槽独立验证

```typescript
function restoreOrAssign(
  slots: InputSlotDefinition[],
  pools: ReferencePools,
  cachedAssignment: PersistedSlotMap | undefined,
  selfResource?: MediaReference,
): UnifiedSlotResult {
  const assigned: Record<string, PoolReference[]> = {}
  const usedNodeIds = new Set<string>()

  // ===== PASS 0: self & paint 插槽 =====
  for (const slot of slots) {
    if (slot.source === 'self') {
      assigned[slot.id] = selfResource ? [selfResource] : []
    } else if (slot.source === 'paint') {
      // paint 数据由框架外部注入（MaskPaintResult）
      // 若缓存中有 paint 结果的 path，恢复它
      const cached = cachedAssignment?.[slot.id]
      if (typeof cached === 'string' && cached.startsWith('paint:')) {
        const paintPath = cached.slice('paint:'.length)
        assigned[slot.id] = [{
          nodeId: `__paint_${slot.id}__`,
          nodeType: 'image',
          url: paintPath,
          path: paintPath,
        }]
      } else {
        assigned[slot.id] = []
      }
    }
  }

  // ===== PASS 1: 逐插槽恢复缓存（仅 pool 插槽）=====
  const poolSlots = slots.filter(s => s.source === 'pool')

  if (cachedAssignment) {
    for (const slot of poolSlots) {
      const cached = cachedAssignment[slot.id]
      if (!cached) continue

      const values = Array.isArray(cached) ? cached : [cached]
      const refs: PoolReference[] = []

      for (const v of values) {
        if (v.startsWith('manual:')) {
          // manual 引用始终有效（不受上游断连影响）
          const path = v.slice('manual:'.length)
          refs.push({
            nodeId: `__manual_${slot.id}_${nanoid(6)}__`,
            nodeType: slot.mediaType,
            url: path,
            path,
          } as MediaReference)
        } else if (mediaRefMap.has(v) && !usedNodeIds.has(v)) {
          // 上游引用仍然存在
          refs.push(mediaRefMap.get(v)!)
          usedNodeIds.add(v)
        }
        // 若不存在 → 静默跳过，不废弃整个缓存
      }

      if (refs.length > 0) {
        assigned[slot.id] = refs
      }
      // 若 refs 为空 → 该插槽稍后由 PASS 2 自动分配
    }
  }

  // ===== PASS 2: 自动分配未填充的 pool 插槽 =====
  for (const slot of poolSlots) {
    if (assigned[slot.id]?.length) continue
    assigned[slot.id] = []
    // ... 从池中取未使用的引用（不变）
  }

  // ===== PASS 3: 收集关联引用 =====
  // ===== PASS 4: 标记缺失必填（self + pool + paint 一起检查）=====
}
```

**关键修复**：
- ✅ manual 引用始终有效（不受上游断连影响）
- ✅ 单个上游断连只影响该插槽
- ✅ paint 插槽的结果可以持久化和恢复（`paint:path` 标记）
- ✅ nanoid 替代索引（避免 ID 冲突）

### 4.3 Paint 插槽的持久化

Paint 结果不再游离，纳入统一持久化流程：

```
用户绘制遮罩 → MaskPaintResult { blob, dataUrl, hasStroke }
  ↓
生成前 → saveBoardAssetFile(blob) → maskPath
  ↓
存入 slotAssignment: { mask: 'paint:asset/mask_xxx.png' }
  ↓
下次恢复 → PASS 0 检测 paint: 前缀 → 重建 MediaReference
  ↓
InputSlotBar 显示遮罩缩略图（从 path 解析 URL）
```

---

## 五、通用渲染架构

### 5.1 GenericVariantForm

```
┌─ GenericVariantForm ─────────────────────────────────┐
│                                                       │
│  ┌─ InputSlotBar ──────────────────────────────────┐  │
│  │  [paint chip]  [pool slot 1]  [pool slot 2]     │  │
│  │  [associated overflow refs]                      │  │
│  │  (self 插槽 hidden，不渲染)                       │  │
│  │  (paint 激活时显示画笔控件：刷子大小 + undo/redo)  │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─ Primary Params ─────────────────────────────────┐ │
│  │  从 paramFields[group='primary'] 自动渲染         │ │
│  │  [size: PillSelect]  [promptExtend: Checkbox]    │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ Custom Params (如有) ───────────────────────────┐ │
│  │  customParamComponent 渲染                        │ │
│  │  （TTS 语音选择器、试听按钮等）                     │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ ▸ Advanced (折叠) ──────────────────────────────┐ │
│  │  从 paramFields[group='advanced'] 自动渲染        │ │
│  │  [negativePrompt: Textarea]  [watermark: ✗]      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
└───────────────────────────────────────────────────────┘
┌─ GenerateActionBar (框架层，非 variant 内) ────────────┐
│  [Count: ×1 ▼]  [Seed: 🎲]  [========= 生成 =========]│
└───────────────────────────────────────────────────────┘
```

**布局顺序固定**：InputSlotBar → primary params → custom component → advanced params。
不存在"两套折叠面板"的问题（审查反馈 #2）。

### 5.2 useParamState Hook

```typescript
function useParamState(
  paramFields: ParamField[],
  customParamIds: string[],       // customComponent 管理的额外参数 ID
  initialSnapshot?: VariantParamsSnapshot,
): {
  params: Record<string, unknown>
  setParam: (id: string, value: unknown) => void
  /** 返回可序列化的参数（排除 visible=false 的字段） */
  serializableParams: Record<string, unknown>
} {
  // 1. 初始值 = initialSnapshot.params[id] ?? field.default
  // 2. setParam 触发 re-render
  // 3. serializableParams 过滤 visible=false 的字段
  // 4. customParamIds 的值也被追踪（由 customComponent 通过 onParamChange 写入）
}
```

### 5.3 Self 插槽缺失时的用户反馈

**审查反馈**：hidden self 插槽 min=1 时用户无感知。

**解决**：self 插槽的 min 约束由 `isApplicable` 前置保证：

```typescript
// 如果 variant 有 self 插槽（需要节点图片），
// isApplicable 必须包含 ctx.nodeHasImage 检查
'OL-UP-001': {
  isApplicable: (ctx) => ctx.nodeHasImage,  // ← 前置保证
  inputSlots: [
    { id: 'image', source: 'self', hidden: true, min: 1, max: 1, ... },
  ],
}
```

- `isApplicable` 返回 false → variant 整个不显示（用户不会误选）
- 如果 variant 显示了但 self 插槽为空 → 生成按钮禁用 + 显示 warning（"需要先为节点添加图片"）

---

## 六、序列化流程（collectParams 重构）

### 6.1 统一序列化器 — serializeForGenerate

取代当前分散在 ImageAiPanel / VideoAiPanel 的 `collectParams()`：

```typescript
function serializeForGenerate(
  variantDef: VariantDefinition,
  slotAssignments: Record<string, PoolReference[]>,
  paramValues: Record<string, unknown>,
  options: {
    count?: number
    seed?: number
    maskPath?: string          // paint 插槽的 asset 路径
    upstreamText?: string      // 上游文本（合并到 prompt）
  },
): V3GenerateRequest {
  const inputs: Record<string, unknown> = {}
  const params: Record<string, unknown> = {}

  // 1. 插槽 → inputs
  for (const slot of variantDef.inputSlots) {
    const refs = slotAssignments[slot.id] ?? []

    if (slot.source === 'paint' && options.maskPath) {
      inputs[slot.id] = toMediaInput(options.maskPath)
      continue
    }
    if (slot.source === 'self') {
      // self 引用已在 slotAssignments 中（由 PASS 0 填充）
      const selfRef = refs[0]
      if (selfRef && isMediaReference(selfRef) && selfRef.path) {
        inputs[slot.id] = toMediaInput(selfRef.path)
      }
      continue
    }
    if (slot.mediaType === 'text') {
      // 文本：合并上游 + 用户输入
      const textRefs = refs.filter(isTextReference)
      const userText = paramValues.__userPrompt as string ?? ''
      const merged = [...textRefs.map(r => r.content), userText]
        .filter(Boolean).join('\n')
      if (merged) inputs[slot.id] = merged
      continue
    }
    // pool 媒体插槽
    const mediaRefs = refs.filter(isMediaReference)
    if (slot.max === 1 && mediaRefs[0]) {
      inputs[slot.id] = toMediaInput(mediaRefs[0].path ?? mediaRefs[0].url)
    } else if (mediaRefs.length > 0) {
      inputs[slot.id] = mediaRefs.map(r => toMediaInput(r.path ?? r.url))
    }
  }

  // 2. mergeInputs（多插槽合并到一个 API 字段）
  if (variantDef.mergeInputs) {
    for (const [targetKey, slotIds] of Object.entries(variantDef.mergeInputs)) {
      const merged: unknown[] = []
      for (const slotId of slotIds) {
        const existing = inputs[slotId]
        if (Array.isArray(existing)) merged.push(...existing)
        else if (existing) merged.push(existing)
        delete inputs[slotId]  // 删除原始 key
      }
      if (merged.length > 0) inputs[targetKey] = merged
    }
  }

  // 3. 参数 → params（直传，因为后端统一了）
  for (const [key, value] of Object.entries(paramValues)) {
    if (key.startsWith('__')) continue  // 跳过内部字段
    params[key] = value
  }

  return {
    feature: variantDef.featureId!,
    variant: '...',  // 由调用方提供
    inputs,
    params,
    count: options.count,
    seed: options.seed,
  }
}
```

### 6.2 InputSnapshot 增强

```typescript
interface InputSnapshot {
  // 已有
  prompt: string
  parameters: Record<string, unknown>
  upstreamRefs: UpstreamRef[]
  timestamp: number

  // ===== 新增 =====
  featureId: string
  variantId: string
  slotAssignment: PersistedSlotMap    // 可以恢复插槽分配
  maskAssetPath?: string              // paint 结果的 asset 路径
}
```

这样"用上次参数重新生成"可以完整恢复 featureId + variantId + 插槽分配 + mask。

---

## 七、完整 Variant 声明示例

### 7.1 OL-IG-001 — 通义万相文生图

```typescript
'OL-IG-001': {
  featureId: 'imageGenerate',
  isApplicable: (ctx) => !ctx.hasImage,
  acceptsInputTypes: ['text'],
  producesOutputType: 'image',
  maxCount: 4,
  defaultCount: 1,
  supportsSeed: true,

  inputSlots: [
    { id: 'prompt', mediaType: 'text', labelKey: 'slot.prompt',
      min: 0, max: 1, source: 'pool', referenceMode: 'inline' },
  ],

  paramFields: [
    { id: 'promptExtend', type: 'boolean', labelKey: 'params.promptExtend',
      default: true, group: 'primary' },
    { id: 'negativePrompt', type: 'text', labelKey: 'params.negativePrompt',
      default: '', group: 'advanced' },
    { id: 'watermark', type: 'boolean', labelKey: 'params.watermark',
      default: false, group: 'advanced' },
  ],
}
```

### 7.2 OL-IP-001 — 即梦图片修复

```typescript
'OL-IP-001': {
  featureId: 'imageInpaint',
  isApplicable: (ctx) => ctx.nodeHasImage,
  acceptsInputTypes: ['image'],
  producesOutputType: 'image',

  inputSlots: [
    { id: 'mask',   mediaType: 'image', labelKey: 'slot.mask',
      min: 1, max: 1, source: 'paint' },
    { id: 'image',  mediaType: 'image', labelKey: 'slot.sourceImage',
      min: 1, max: 1, source: 'self', hidden: true },
    { id: 'prompt', mediaType: 'text',  labelKey: 'slot.prompt',
      min: 0, max: 1, source: 'pool', referenceMode: 'inline' },
  ],
  // 无 paramFields（仅需 mask + image + prompt）
}
```

### 7.3 OL-IE-001 — 通义图片编辑 Plus

```typescript
'OL-IE-001': {
  featureId: 'imageEdit',
  isApplicable: (ctx) => ctx.hasImage,
  acceptsInputTypes: ['image'],
  producesOutputType: 'image',
  maxCount: 6,
  defaultCount: 1,
  supportsSeed: true,

  inputSlots: [
    { id: 'mask',   mediaType: 'image', labelKey: 'slot.mask',
      min: 0, max: 1, source: 'paint' },
    { id: 'image',  mediaType: 'image', labelKey: 'slot.sourceImage',
      min: 1, max: 1, source: 'self', hidden: true },
    { id: 'prompt', mediaType: 'text',  labelKey: 'slot.prompt',
      min: 1, max: 1, source: 'pool', referenceMode: 'inline' },
    { id: 'refs',   mediaType: 'image', labelKey: 'slot.referenceImages',
      min: 0, max: 2, source: 'pool' },
  ],

  // self 的 image 和 pool 的 refs 合并为 inputs.images
  mergeInputs: { images: ['image', 'refs'] },

  paramFields: [
    { id: 'size', type: 'select', labelKey: 'params.size', default: 'auto',
      group: 'primary',
      options: [
        { value: 'auto', labelKey: 'params.size.auto' },
        { value: '1024*1024', labelKey: 'params.size.1024' },
        { value: '1536*1536', labelKey: 'params.size.1536' },
      ] },
    { id: 'promptExtend', type: 'boolean', labelKey: 'params.promptExtend',
      default: true, group: 'primary' },
    { id: 'negativePrompt', type: 'text', labelKey: 'params.negativePrompt',
      default: '', group: 'advanced' },
    { id: 'watermark', type: 'boolean', labelKey: 'params.watermark',
      default: false, group: 'advanced' },
  ],
}
```

### 7.4 OL-VG-001 — 万相视频生成

```typescript
'OL-VG-001': {
  featureId: 'videoGenerate',
  isApplicable: (ctx) => ctx.hasImage,
  acceptsInputTypes: ['image', 'audio'],
  producesOutputType: 'video',
  supportsSeed: true,

  inputSlots: [
    { id: 'prompt',     mediaType: 'text',  labelKey: 'slot.prompt',
      min: 0, max: 1, source: 'pool', referenceMode: 'inline' },
    { id: 'startImage', mediaType: 'image', labelKey: 'slot.startFrame',
      min: 1, max: 1, source: 'pool' },
    { id: 'audio',      mediaType: 'audio', labelKey: 'slot.audio',
      min: 0, max: 1, source: 'pool' },
  ],

  paramFields: [
    { id: 'duration', type: 'select', labelKey: 'params.duration', default: 5,
      group: 'primary',
      options: [
        { value: 5, labelKey: 'params.duration.5s' },
        { value: 10, labelKey: 'params.duration.10s' },
      ] },
    { id: 'resolution', type: 'select', labelKey: 'params.resolution', default: '1080P',
      group: 'primary',
      options: [
        { value: '720P', labelKey: 'params.resolution.720p' },
        { value: '1080P', labelKey: 'params.resolution.1080p' },
      ] },
    { id: 'shotType', type: 'select', labelKey: 'params.shotType', default: 'single',
      group: 'primary',
      options: [
        { value: 'single', labelKey: 'params.shotType.single' },
        { value: 'multi', labelKey: 'params.shotType.multi' },
      ] },
    { id: 'promptExtend', type: 'boolean', labelKey: 'params.promptExtend',
      default: true, group: 'primary' },
    { id: 'watermark', type: 'boolean', labelKey: 'params.watermark',
      default: false, group: 'advanced' },
  ],
}
```

### 7.5 OL-TT-001 — CosyVoice 语音合成（带自定义组件）

```typescript
'OL-TT-001': {
  featureId: 'tts',
  isApplicable: () => true,
  acceptsInputTypes: ['text'],
  producesOutputType: 'audio',

  inputSlots: [
    { id: 'text', mediaType: 'text', labelKey: 'slot.text',
      min: 1, max: 1, source: 'pool', referenceMode: 'replace' },
  ],

  paramFields: [
    { id: 'voice', type: 'select', labelKey: 'params.voice', default: 'longanyang',
      group: 'primary',
      options: [
        { value: 'longanyang', labelKey: 'params.voice.longanyang' },
        { value: 'longanhuan', labelKey: 'params.voice.longanhuan' },
        // ...
      ] },
    { id: 'format', type: 'select', labelKey: 'params.format', default: 'mp3',
      group: 'advanced',
      options: [
        { value: 'mp3', labelKey: 'params.format.mp3' },
        { value: 'wav', labelKey: 'params.format.wav' },
      ] },
  ],

  // 高级参数用自定义组件（speechRate/pitchRate/volume 滑块 + 试听按钮）
  customParamComponent: TtsCosyVoiceAdvanced,
}
```

---

## 八、SaaS 侧改造清单

### 8.1 必须改（统一契约）

| Handler | 改动 | 说明 |
|---------|------|------|
| `volc-jimeng-inpaint.ts` | `input.params.prompt` → `input.inputs.prompt` | Prompt 统一在 inputs |
| `volc-jimeng-t2v.ts` | `input.params.prompt` → `input.inputs.prompt` | 同上 |
| `volc-jimeng-t2i-v40.ts` | `input.params.prompt` → `input.inputs.prompt` | 同上 |
| `volc-jimeng-t2i-v31.ts` | `input.params.prompt` → `input.inputs.prompt` | 同上 |
| 所有 handler | `params.count`/`params.n` → `input.count`（顶层） | Count 统一 |
| `v3Routes.ts` | 路由层提取 `count` 并传入 handler | 新增 count 到 HandlerInput |

### 8.2 建议改（添加 inputSchema）

为每个 handler 添加 Zod schema，让路由层拦截无效参数：

```typescript
// qwen-image.ts
inputSchema = z.object({
  inputs: z.object({
    prompt: z.string().max(800),
  }),
  params: z.object({
    aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3']).default('1:1'),
    negativePrompt: z.string().max(500).optional(),
    promptExtend: z.boolean().default(true),
    watermark: z.boolean().default(false),
  }).partial(),
})
```

### 8.3 HandlerInput 增强

```typescript
interface HandlerInput {
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  seed?: number
  count?: number          // ← 新增：从请求顶层提取
  userId: string
}
```

---

## 九、迁移策略

### Phase 0：SaaS 侧统一（前置条件）
1. 修改 4 个 Volc handler 的 prompt 位置
2. 统一 count 到 HandlerInput 顶层
3. 前端不需要改任何代码（因为旧代码本来就传了 inputs.prompt）

### Phase 1：前端类型定义
1. 新增 `SlotSource` 类型
2. 扩展 `InputSlotDefinition`（source、hidden）
3. 新增 `ParamField` 类型
4. 扩展 `VariantDefinition`（paramFields、maxCount、mergeInputs）
5. **旧字段保留但标记 @deprecated**，新旧可并存

### Phase 2：引擎改造
1. `buildReferencePools` 感知 self 插槽
2. `restoreOrAssign` 改为按插槽独立验证
3. manual ID 改用 nanoid
4. paint 持久化（`paint:path` 标记）
5. **同时支持旧 slot（无 source）和新 slot（有 source）**
   - 无 source → 视为 `pool`（向后兼容）

### Phase 3：通用渲染器
1. 实现 `useParamState` hook
2. 实现 `GenericVariantForm`（ParamFieldRenderer）
3. 实现 `serializeForGenerate`
4. Count 选择器移到 GenerateActionBar

### Phase 4：逐步迁移 Variant
- 为每个 variant 编写 `paramFields`
- **迁移顺序**：简单的先（UpscaleQwen → ImgGenText → ...），复杂的后（TTS）
- 每个 variant 迁移后，移除旧的 `component` 引用
- 但不删除旧组件文件，直到所有 variant 迁移完成

### Phase 5：清理
- 删除所有旧 variant 组件
- 删除 `overflowStrategy`、`isPaintable`、`allowManualInput`
- 删除 `component` 字段
- 增强 InputSnapshot

---

## 十、审查反馈回应

| 审查问题 | 解决方案 |
|---------|---------|
| **缓存全量废弃** | PASS 1 改为逐插槽验证，manual 始终有效 |
| **manual ID 冲突** | nanoid(6) 替代索引 |
| **self 插槽无图时无反馈** | isApplicable 前置 + 生成按钮禁用 + warning |
| **paint 不持久化** | `paint:path` 标记 + InputSnapshot.maskAssetPath |
| **Prompt 位置不统一** | SaaS Volc handler 统一到 inputs.prompt |
| **visible() 无法访问 variantId** | ctx 包含 { params, variantId } |
| **Count 选择器缺失** | 移到 GenerateActionBar 框架层 |
| **customComponent 布局割裂** | 固定布局顺序：primary → custom → advanced |
| **InputSnapshot 不完整** | 新增 featureId/variantId/slotAssignment/maskAssetPath |
| **GenericVariantForm 覆盖率** | ~80% schema + ~20% customParamComponent |
| **paramsCache 迁移** | Phase 2 兼容层：无 source → 视为 pool |
| **mergeSlots 实现缺失** | serializeForGenerate 统一处理 mergeInputs |
| **生成后 self 自动更新** | self 不持久化，始终读 nodeResource（最新值） |
| **Associated refs 无限堆积** | 上限 6 个，超出显示 "+N" 折叠 |

---

## 十一、预期收益

| 指标 | 当前 | 重构后 |
|------|------|--------|
| 新增 variant 代码量 | 300-500 行组件 | 15-40 行 schema |
| 参数与 SaaS 不对齐风险 | 高（手写+位置不一致） | 极低（统一契约+直传） |
| 手动上传丢失 | 存在 | 不可能（per-slot 缓存） |
| 节点图混入参考池 | 存在 | 不可能（self/pool 分离） |
| 遮罩丢失 | 存在 | 不可能（paint 持久化） |
| 重试/回溯 | 丢失上下文 | 完整恢复（增强 InputSnapshot） |
| 前端 apiMapping 复杂度 | 需要路径映射 | 零（SaaS 统一后直传） |
