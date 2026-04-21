# @ai-sdk/openai

升级：`3.0.37` → `3.0.53`

## 变更摘要

- 新增 `gpt-5.3-codex` 模型支持。
- 补齐多种 `OpenAIChatModelId`、`OpenAIResponsesModelId`、`OpenAIImageModelId` 上缺失的 model ID，改善 autocomplete。
- 清理废弃 model IDs（包括 Anthropic、Google、OpenAI、xAI 的过时条目）。
- Responses API message item 新增 `phase` 字段（`gpt-5.3-codex` 等模型会返回）。
- Provider 能力扩展：支持 native skills、hosted shell、custom tools（含 alias mapping）。
- 区分 text vs image 输入 token（billing 颗粒度提升）。
- 修复：streaming tool call delta 中允许 null/undefined type；在 `encrypted_content` 存在时包含没有 `itemId` 的 reasoning parts；web search tool action 改为 optional。
- provider-specific model options 类型名统一归一化并确保 export。

## 原始 changelog 摘录

### 3.0.53
- Updated dependencies: @ai-sdk/provider-utils@4.0.19

### 3.0.52
- Updated dependencies: @ai-sdk/provider-utils@4.0.18

### 3.0.51
- Updated dependencies: @ai-sdk/provider-utils@4.0.17

### 3.0.50
- chore: remove obsolete model IDs for Anthropic, Google, OpenAI, xAI

### 3.0.49
- feat(provider/openai): support custom tools with alias mapping
- Updated dependencies: @ai-sdk/provider-utils@4.0.16

### 3.0.48
- fix(openai): allow null/undefined type in streaming tool call deltas

### 3.0.47
- fix(openai): include reasoning parts without itemId when encrypted_content is present

### 3.0.46
- Support `phase` parameter on Responses API message items. The `phase` field is returned by models like `gpt-5.3-codex`.

### 3.0.45
- Added missing model IDs to OpenAIChatModelId, OpenAIResponsesModelId, OpenAIImageModelId, and others

### 3.0.44
- feat(provider/openai): add `gpt-5.3-codex`

### 3.0.43
- fix(openai): change web search tool action to be optional

### 3.0.42
- feat(provider/openai): support native skills and hosted shell

### 3.0.41
- feat: differentiate text vs image input tokens

### 3.0.40
- Updated dependencies: @ai-sdk/provider-utils@4.0.15

### 3.0.39
- feat: normalize provider specific model options type names and ensure they are exported

### 3.0.38
- Updated dependencies: @ai-sdk/provider@3.0.8, @ai-sdk/provider-utils@4.0.14
