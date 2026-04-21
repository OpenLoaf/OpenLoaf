# @ai-sdk/google

升级：`3.0.55` → `3.0.64`

## 变更摘要

- 新增 `gemini-3.1-pro-preview` 与 `gemini-3.1-flash-image-preview` 模型支持。
- Gemini 图像模型允许用于 `generateImage`（Google 与 Vertex 两侧都打通）。
- 新增 Google 图像模型的多种 aspect ratios 与 sizes 支持。
- 补齐 `GoogleGenerativeAIModelId` 与 `GoogleGenerativeAIVideoModelId` 类型中的 model IDs，改善 autocomplete。
- 修复 Vertex 在 `providerOptions` keyname 场景下的兜底。

## 原始 changelog 摘录

### 3.0.64
- Updated dependencies: @ai-sdk/provider-utils@4.0.16

### 3.0.63
- feat(provider/google): add support for new Google image model aspect ratios and sizes

### 3.0.62
- feat(provider/google): add support for gemini-3.1-flash-image-preview

### 3.0.61
- Added missing model IDs to GoogleGenerativeAIModelId and GoogleGenerativeAIVideoModelId types for better autocomplete support.

### 3.0.60
- feat(provider/google): add support for `gemini-3.1-pro-preview`

### 3.0.59
- Updated dependencies: @ai-sdk/provider-utils@4.0.15

### 3.0.58
- feat(provider/google-vertex): allow using Gemini image models with `generateImage`

### 3.0.57
- fix(vertex): add fallback for providerOptions keyname

### 3.0.56
- feat(google): allow using Gemini image models with `generateImage`
