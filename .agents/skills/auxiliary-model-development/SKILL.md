---
name: auxiliary-model-development
description: >
  Use when developing, extending, or debugging the OpenLoaf auxiliary model
  system — adding new capabilities, modifying inference logic, customizing
  prompts, or updating the auxiliary model settings UI.
---

# Auxiliary Model Development

## Overview

辅助模型（Auxiliary Model）是 OpenLoaf 中独立于主 Chat Agent 的轻量级推理层。它在后台静默运行，为项目分类、对话标题生成、输入建议等场景提供快速推理，失败时自动兜底，**绝不阻塞主流程**。

核心设计原则：
- **静默兜底**：所有调用均 try-catch 包裹，异常时返回 fallback 值
- **3 秒超时**：每次推理 hard timeout 3s，防止慢模型拖垮体验
- **5 分钟缓存**：相同 capability + context 的结果在内存中缓存 5 分钟
- **与主 Agent 分离**：使用独立的模型配置（`auxiliary-model.json`），不影响聊天模型

## Architecture

```
用户操作 / 系统事件
    │
    ▼
业务代码调用 auxiliaryInfer() / auxiliaryInferText()
    │
    ├─ 1. 检查内存缓存（SHA-256 hash key）
    │     └─ 命中 → 直接返回
    │
    ├─ 2. 读取 auxiliary-model.json 配置
    │     └─ modelSource (local/cloud) → modelIds
    │
    ├─ 3. resolveChatModel() 解析模型实例
    │
    ├─ 4. 构建 prompt（customPrompt > defaultPrompt）
    │
    ├─ 5. 调用 Vercel AI SDK
    │     ├─ structured → generateObject(schema)
    │     └─ text → generateText()
    │
    ├─ 6. 写入缓存（TTL 5min）
    │
    └─ 7. 返回结果（或 fallback）
```

## Key Files Map

| 文件 | 职责 |
|------|------|
| `apps/server/src/ai/services/auxiliaryCapabilities.ts` | 能力注册表：Zod schema + 能力定义 + 默认 prompt |
| `apps/server/src/ai/services/auxiliaryInferenceService.ts` | 推理引擎：`auxiliaryInfer()` + `auxiliaryInferText()` + 缓存 |
| `apps/server/src/modules/settings/auxiliaryModelConfStore.ts` | 配置读写：`~/.openloaf/auxiliary-model.json` |
| `packages/api/src/routers/absSetting.ts` | tRPC schema：`getAuxiliaryCapabilities` / `getAuxiliaryModelConfig` |
| `apps/server/src/routers/settings.ts` | tRPC 路由实现：能力列表 + 配置读写 + 项目类型推断 |
| `apps/web/src/components/setting/menus/AuxiliaryModelSettings.tsx` | 前端设置 UI：模型选择 + 能力配置 + prompt 编辑器 |

## Capability Registry

当前 6 个内置能力：

| Key | Label | Output Mode | 用途 |
|-----|-------|-------------|------|
| `project.classify` | 项目分类 | `structured` | 扫描文件结构，判断项目类型 + 推荐图标 |
| `chat.suggestions` | 输入推荐 | `structured` | 打开聊天窗口或输入停顿时生成智能补全建议 |
| `chat.title` | 摘要标题 | `structured` | 对话结束后自动生成标题 |
| `project.ephemeralName` | 项目重命名 | `structured` | 用户手动触发，为项目生成名称 |
| `git.commitMessage` | Commit 信息 | `structured` | 根据 diff 生成规范 commit message |
| `text.translate` | 文本翻译 | `text` | 选中文本翻译为目标语言 |

## Output Mode Guide

选择 `outputMode` 的决策树：

```
需要 JSON 结构化数据？
  ├─ 是 → "structured"（使用 generateObject + Zod schema）
  └─ 否
      ├─ 需要纯文本/自然语言？→ "text"（使用 generateText）
      ├─ 需要调用工具？→ "tool-call"（预留，暂未实现）
      └─ 需要执行 skill？→ "skill"（预留，暂未实现）
```

**当前可用**：`structured` 和 `text`。`tool-call` / `skill` 为预留扩展。

## Calling Convention

### structured 模式 — `auxiliaryInfer()`

```typescript
import { auxiliaryInfer } from '@/ai/services/auxiliaryInferenceService'
import { CAPABILITY_SCHEMAS } from '@/ai/services/auxiliaryCapabilities'

const result = await auxiliaryInfer({
  capabilityKey: 'project.classify',
  context: '文件列表:\n- package.json\n- src/index.ts\n- tsconfig.json',
  schema: CAPABILITY_SCHEMAS['project.classify'],
  fallback: { type: 'general', icon: '📁', confidence: 0 },
})
```

### text 模式 — `auxiliaryInferText()`

```typescript
import { auxiliaryInferText } from '@/ai/services/auxiliaryInferenceService'

const result = await auxiliaryInferText({
  capabilityKey: 'text.translate',
  context: '请将以下文本翻译为英文：你好世界',
  fallback: '',
})
```

### 关键参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `capabilityKey` | `CapabilityKey` | 能力注册表中的 key |
| `context` | `string` | 用户输入 / 业务上下文（作为 prompt） |
| `schema` | `z.ZodType` | 仅 structured 模式，Zod 验证 schema |
| `fallback` | `T \| string` | 推理失败时的兜底值 |
| `noCache` | `boolean?` | 跳过缓存（默认 false） |

## Adding a New Capability (Quick)

> 完整代码模板和示例见 [references/capability-development.md](references/capability-development.md)

**5 步速查清单：**

1. **定义 Schema** — 在 `auxiliaryCapabilities.ts` 的 `CAPABILITY_SCHEMAS` 中添加 Zod schema
2. **注册能力** — 在 `AUXILIARY_CAPABILITIES` 中添加完整能力定义（key、label、description、triggers、defaultPrompt、outputMode、outputSchema）
3. **更新 CAPABILITY_KEYS** — 将新 key 追加到有序数组
4. **添加前端图标** — 在 `AuxiliaryModelSettings.tsx` 的 `CAP_ICON_MAP` 中添加图标和颜色映射
5. **业务代码调用** — 在需要的地方调用 `auxiliaryInfer()` 或 `auxiliaryInferText()`

> tRPC 层无需修改 — `getAuxiliaryCapabilities` 路由直接遍历 `AUXILIARY_CAPABILITIES` 对象。

## Prompt Writing Rules

为辅助模型能力编写 `defaultPrompt` 时遵循以下规则：

1. **角色开头** — 以「你是一个 XX 专家」开头，明确角色定位
2. **规则列表** — 使用 `规则：` + 无序列表格式，列出约束条件
3. **字数限制** — 涉及用户可见文本时，明确标注最大字数/字符数
4. **语言适配** — 如需多语言输出，在规则中说明语言选择逻辑
5. **避免过度描述** — prompt 应 ≤ 300 字，辅助模型使用小模型，过长 prompt 效果反而更差
6. **不包含 schema 说明** — Zod schema 会通过 `generateObject` 自动传递，prompt 中无需重复字段定义

## Skill Sync Policy

当以下源文件发生变更时，应同步更新此 Skill 文档：

- `auxiliaryCapabilities.ts` — 新增/修改能力 → 更新 Capability Registry 表
- `auxiliaryInferenceService.ts` — 推理逻辑变更 → 更新 Architecture 和 Calling Convention
- `AuxiliaryModelSettings.tsx` — UI 变更 → 更新 Key Files Map 和前端图标步骤
- `absSetting.ts` — tRPC schema 变更 → 更新 references 中的 tRPC 步骤
