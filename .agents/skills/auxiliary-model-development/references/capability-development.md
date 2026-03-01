# Capability Development Guide

新增辅助模型能力的完整开发指南，包含每一步的代码模板和示例。

---

## Step 1: Define Schema

在 `apps/server/src/ai/services/auxiliaryCapabilities.ts` 的 `CAPABILITY_SCHEMAS` 对象中添加 Zod schema。

### structured 模式模板

```typescript
// auxiliaryCapabilities.ts — CAPABILITY_SCHEMAS 内
'domain.capabilityName': z.object({
  field1: z.string().describe('字段说明，不超过 N 字'),
  field2: z.number().min(0).max(1),
  field3: z.enum(['option1', 'option2']),
  items: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
    }),
  ).optional(),
}),
```

### text 模式

text 模式无需定义 Zod schema，跳过此步。`outputSchema` 字段在注册时设为 `{}`。

### 命名规范

- Key 格式：`domain.camelCase`（如 `project.classify`、`chat.title`、`git.commitMessage`）
- domain 表示功能域：`project`、`chat`、`git`、`text`、`code`、`doc` 等
- camelCase 表示具体能力

### Schema 编写要点

- 每个字段必须有 `.describe()` 注解 — 小模型依赖这些描述理解输出格式
- 字符串字段指明最大长度（如 `不超过 20 字`）
- 数值字段用 `.min()` / `.max()` 约束范围
- 可选字段用 `.optional()` 标记
- 枚举字段用 `z.enum()` 显式列出可选值

---

## Step 2: Register Capability

在同一文件的 `AUXILIARY_CAPABILITIES` 对象中添加完整能力定义。

### structured 模式模板

```typescript
// auxiliaryCapabilities.ts — AUXILIARY_CAPABILITIES 内
'domain.capabilityName': {
  key: 'domain.capabilityName',
  label: '能力中文名',
  description: '一句话描述此能力的作用和触发时机。',
  outputMode: 'structured',
  triggers: [
    '触发场景 1',
    '触发场景 2',
  ],
  defaultPrompt: `你是一个 XX 专家。根据提供的 YY，完成 ZZ。

规则：
- 规则 1
- 规则 2
- 规则 3`,
  outputSchema: CAPABILITY_SCHEMAS['domain.capabilityName'].toJSONSchema(),
},
```

### text 模式模板

```typescript
'domain.capabilityName': {
  key: 'domain.capabilityName',
  label: '能力中文名',
  description: '一句话描述此能力的作用和触发时机。',
  outputMode: 'text',
  triggers: [
    '触发场景 1',
  ],
  defaultPrompt: `你是一个 XX 专家。根据提供的文本完成 ZZ。

规则：
- 只输出结果，不添加解释
- 保留原文格式`,
  outputSchema: {},  // text 模式无 schema
},
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `key` | `string` | 是 | 唯一标识，与对象 key 一致 |
| `label` | `string` | 是 | 中文显示名称（≤ 8 字） |
| `description` | `string` | 是 | 能力描述（显示在设置 UI） |
| `outputMode` | `AuxiliaryOutputMode` | 是 | `'structured'` \| `'text'` \| `'tool-call'` \| `'skill'` |
| `triggers` | `string[]` | 是 | 触发场景列表（显示在设置 UI） |
| `defaultPrompt` | `string` | 是 | 默认系统提示词（用户可覆盖） |
| `outputSchema` | `Record<string, unknown>` | 是 | JSON Schema（structured 用 `.toJSONSchema()`，text 用 `{}`） |

---

## Step 3: Update CAPABILITY_KEYS

将新的 key 追加到 `CAPABILITY_KEYS` 数组末尾：

```typescript
export const CAPABILITY_KEYS = [
  'project.classify',
  'chat.suggestions',
  'chat.title',
  'project.ephemeralName',
  'git.commitMessage',
  'text.translate',
  'domain.capabilityName',  // ← 新增
] as const
```

此数组控制 UI 中能力的显示顺序，同时生成 `CapabilityKey` 类型。

---

## Step 4: Add Frontend Icon

在 `apps/web/src/components/setting/menus/AuxiliaryModelSettings.tsx` 中添加图标映射。

### 4.1 导入 Lucide 图标

```typescript
import {
  // ... 已有导入
  YourIcon,  // ← 从 lucide-react 导入
} from 'lucide-react'
```

### 4.2 添加到 CAP_ICON_MAP

```typescript
const CAP_ICON_MAP: Record<string, { icon: LucideIcon; color: string }> = {
  // ... 已有映射
  'domain.capabilityName': {
    icon: YourIcon,
    color: 'text-pink-500 dark:text-pink-400',  // 选择与现有能力不重复的颜色
  },
}
```

### 颜色选择参考

已使用的颜色：
- `sky` — project.classify
- `violet` — chat.suggestions
- `amber` — chat.title
- `emerald` — project.ephemeralName
- `orange` — git.commitMessage
- `teal` — text.translate

可用颜色：`pink`、`rose`、`indigo`、`cyan`、`lime`、`fuchsia`

---

## Step 5: Call in Business Code

### structured 模式调用

```typescript
import { auxiliaryInfer } from '@/ai/services/auxiliaryInferenceService'
import { CAPABILITY_SCHEMAS } from '@/ai/services/auxiliaryCapabilities'

// 在业务函数中（通常是 tRPC 路由或服务层）
export async function classifyProject(fileList: string[]): Promise<{
  type: string
  icon: string
  confidence: number
}> {
  const result = await auxiliaryInfer({
    capabilityKey: 'project.classify',
    context: `文件列表:\n${fileList.map((f) => `- ${f}`).join('\n')}`,
    schema: CAPABILITY_SCHEMAS['project.classify'],
    fallback: { type: 'general', icon: '📁', confidence: 0 },
  })
  return result
}
```

### text 模式调用

```typescript
import { auxiliaryInferText } from '@/ai/services/auxiliaryInferenceService'

export async function translateText(
  text: string,
  targetLang?: string,
): Promise<string> {
  const context = targetLang
    ? `请将以下文本翻译为${targetLang}：\n\n${text}`
    : text
  return auxiliaryInferText({
    capabilityKey: 'text.translate',
    context,
    fallback: text,  // 翻译失败时返回原文
  })
}
```

### 调用要点

- **fallback 必须有意义** — 它是推理失败时用户看到的实际值，不能为 `null` 或空对象
- **context 要精练** — 辅助模型通常是小模型（如 GPT-4o-mini），context 过长效果差
- **不要 await 阻塞 UI** — 如果结果不紧急，用 `void auxiliaryInfer(...)` 异步执行，结果写入缓存或 DB
- **noCache 慎用** — 仅在用户主动触发（如"重新生成"）时设为 `true`

---

## Checklist

新增一个辅助模型能力后，按以下清单验证：

### 后端

- [ ] `CAPABILITY_SCHEMAS` 中有对应的 Zod schema（structured 模式）
- [ ] `AUXILIARY_CAPABILITIES` 中有完整的能力定义
- [ ] `CAPABILITY_KEYS` 数组中包含新 key
- [ ] `defaultPrompt` 遵循 prompt 编写规则（角色 + 规则列表 + ≤ 300 字）
- [ ] TypeScript 类型检查通过：`pnpm run check-types`

### 前端

- [ ] `CAP_ICON_MAP` 中有图标和颜色映射
- [ ] 颜色不与现有能力重复
- [ ] 启动 dev server → 设置 → 辅助模型 → 能力列表中显示新能力
- [ ] 能力详情页显示正确（label、description、triggers、outputMode badge、prompt）

### 集成

- [ ] 至少一处业务代码调用了 `auxiliaryInfer()` 或 `auxiliaryInferText()`
- [ ] fallback 值有意义（非空、非 null）
- [ ] 断网 / 模型不可用时，功能不崩溃，静默使用 fallback

### tRPC（通常无需修改）

`getAuxiliaryCapabilities` 路由直接遍历 `AUXILIARY_CAPABILITIES` 对象并返回，新增能力后无需修改 tRPC 层。仅当以下情况需要改动：

- 新增了独立的 tRPC mutation/query 来触发推理（如 `inferProjectType`）
- 需要修改 `absSetting.ts` 中 `getAuxiliaryCapabilities.output` 的字段（如新增 `outputMode` 类型）

---

## Example: Adding a Code Review Capability

以下是一个完整示例——添加「代码审查建议」能力：

### 1. Schema

```typescript
'code.reviewSuggestions': z.object({
  suggestions: z.array(
    z.object({
      file: z.string().describe('文件路径'),
      line: z.number().describe('行号'),
      severity: z.enum(['info', 'warning', 'error']),
      message: z.string().describe('建议内容，不超过 100 字'),
    }),
  ),
}),
```

### 2. Registration

```typescript
'code.reviewSuggestions': {
  key: 'code.reviewSuggestions',
  label: '代码审查',
  description: '分析代码变更，给出改进建议和潜在问题提醒。',
  outputMode: 'structured',
  triggers: ['提交代码前自动审查', '用户手动请求代码审查'],
  defaultPrompt: `你是一个代码审查专家。分析提供的代码 diff，给出改进建议。

规则：
- 每条建议指明文件和行号
- severity=error 仅用于明确的 bug 或安全问题
- severity=warning 用于代码质量和性能问题
- severity=info 用于风格建议和最佳实践
- 建议不超过 5 条，聚焦最重要的问题`,
  outputSchema: CAPABILITY_SCHEMAS['code.reviewSuggestions'].toJSONSchema(),
},
```

### 3. CAPABILITY_KEYS

```typescript
export const CAPABILITY_KEYS = [
  // ... 已有 keys
  'code.reviewSuggestions',
] as const
```

### 4. Frontend Icon

```typescript
import { CodeXml } from 'lucide-react'

// CAP_ICON_MAP 中
'code.reviewSuggestions': {
  icon: CodeXml,
  color: 'text-pink-500 dark:text-pink-400',
},
```

### 5. Business Call

```typescript
const suggestions = await auxiliaryInfer({
  capabilityKey: 'code.reviewSuggestions',
  context: `代码变更:\n\`\`\`diff\n${diffContent}\n\`\`\``,
  schema: CAPABILITY_SCHEMAS['code.reviewSuggestions'],
  fallback: { suggestions: [] },
})
```
