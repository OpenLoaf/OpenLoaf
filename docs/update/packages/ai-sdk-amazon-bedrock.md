# @ai-sdk/amazon-bedrock

升级：`4.0.85` → `4.0.96`

## 变更摘要

- 将已废弃的 `output_format` 参数迁移到 `output_config.format`。
- 为 Bedrock Anthropic 模型启用原生 structured output 支持。
- `feat(anthropic)`: 将 `anthropic.anthropicBeta` 暴露给下游 provider（Bedrock 这边也跟着透出）。
- 修复 Bedrock 文件 filename 中的扩展名不应带出的问题（`strip file extensions from filename`）。
- 其余为依赖 (`provider-utils`) 版本升级透传。

## 原始 changelog 摘录

### 4.0.96
- Updated dependencies

### 4.0.95
- Updated dependencies

### 4.0.94
- feat(anthropic): expose anthropic.anthropicBeta to downstream providers
- Updated dependencies

### 4.0.93
- Updated dependencies

### 4.0.92
- Updated dependencies

### 4.0.91
- Updated dependencies

### 4.0.90
- fix(bedrock): strip file extensions from filename
- Updated dependencies

### 4.0.89
- Updated dependencies

### 4.0.88
- Updated dependencies

### 4.0.87
- Migrated deprecated `output_format` parameter to `output_config.format`
- Enabled native structured output support for Bedrock Anthropic models
- Updated dependencies

### 4.0.86
- Updated dependencies
