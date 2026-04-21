# @ai-sdk/xai

升级：`3.0.75` → `3.0.83`

## 变更摘要

- `fix(xai): support encrypted reasoning round-trip for ZDR` —— 支持 ZDR（Zero Data Retention）场景下的 encrypted reasoning 往返。
- `fix (provider/xai): handle mid-stream error chunks` —— 流中间的 error chunk 现在能被正确处理。
- `fix (provider/xai): add response.incomplete and response.failed streaming event handling` —— 补齐 `response.incomplete` / `response.failed` 流事件。
- `feat(provider/xai): add video extension and reference-to-video (R2V) support` —— 新增视频扩展与 R2V 能力。
- `Add AI Gateway hint to provider READMEs`（文档）。
- 其余为 `@ai-sdk/provider-utils` / `@ai-sdk/openai-compatible` 依赖跟随。

## 原始 changelog 摘录

### 3.0.83
- fix(xai): support encrypted reasoning round-trip for ZDR

### 3.0.82
- fix (provider/xai): handle mid-stream error chunks

### 3.0.81
- fix (provider/xai): add response.incomplete and response.failed streaming event handling

### 3.0.80
- Add AI Gateway hint to provider READMEs
- Updated dependencies: @ai-sdk/openai-compatible@2.0.41

### 3.0.79
- Updated dependencies: @ai-sdk/openai-compatible@2.0.40

### 3.0.78
- Updated dependencies: @ai-sdk/provider-utils@4.0.23, @ai-sdk/openai-compatible@2.0.39

### 3.0.77
- feat(provider/xai): add video extension and reference-to-video (R2V) support

### 3.0.76
- Updated dependencies: @ai-sdk/provider-utils@4.0.22, @ai-sdk/openai-compatible@2.0.38
