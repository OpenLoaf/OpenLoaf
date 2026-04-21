# @ai-sdk/anthropic

升级：`3.0.64` → `3.0.71`

## 变更摘要

- 新增对 `Opus 4.6` 的支持。
- 新增 `custom tool-reference content`，用于 deferred tool loading。
- 修复 streaming 时 `context_management` 字段位置：之前错误地从 delta 对象内读取，实际上 API 在 `message_delta` 根级返回。
- 修复 tool schema 中缺失 param 的问题。

## 原始 changelog 摘录

### 3.0.71
- Updated dependencies: @ai-sdk/provider@3.0.8, @ai-sdk/provider-utils@4.0.14

### 3.0.70
- feat(anthropic): add support for Opus 4.6

### 3.0.69
- feat(anthropic): support custom tool-reference content for deferred tool loading

### 3.0.68
- Updated dependencies: @ai-sdk/provider@3.0.7, @ai-sdk/provider-utils@4.0.13

### 3.0.67
- Updated dependencies: @ai-sdk/provider-utils@4.0.12

### 3.0.66
- fix streaming context_management field location — was incorrectly expected inside delta object but API returns it at message_delta root level

### 3.0.65
- fix(anthropic): add missing param in tool schema
