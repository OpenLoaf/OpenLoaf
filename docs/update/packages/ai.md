# ai

升级：`6.0.142` → `6.0.168`

## 变更摘要

- 新增 `feat: expose raw finish reason`，可从 result 读取底层 provider 的原始 finish reason。
- 新增 `feat: image editing` 能力（provider 侧打通图像编辑接口）。
- 新增 `feat: Standard JSON Schema support`，支持 Standard JSON Schema 规范。
- 新增 `feat(anthropic): add programmatic tool calling`（为 Anthropic 打通 programmatic tool 调用）。
- `Tool.toModelOutput` 能力增强：支持 async、新增 `toolCallId` 参数、改为 parameter object 形式调用。
- `feat(ai): allow modifying experimental context in prepareStep`，`prepareStep` 可修改 experimental context。
- `feat(ai): print model warnings in embed and embedMany`，嵌入接口打印模型 warning。
- agent UI stream 函数上的 `messages` 属性重命名为 `uiMessages`（breaking rename）。
- `generateText` 与 `output` 增加 schema name/description 字段。
- Gateway 错误体验：未设 `AI_GATEWAY_API_KEY` 时在非生产环境抛出带友好提示的错误。
- 修复 `writeHead` 中 `statusText` 为 undefined 时 header 丢失的问题。
- 重命名 `EmbeddingModelCallOptions`（specification 层）。
- 内部 tool helper 重命名。

## 原始 changelog 摘录

### 6.0.168
- Updated dependencies: `@ai-sdk/gateway@2.0.0-beta.93`

### 6.0.167
- chore(specification): rename EmbeddingModelCallOptions

### 6.0.166
- chore: updated README

### 6.0.165
- feat(openai): update spec for mcp approval

### 6.0.164
- feat: expose raw finish reason

### 6.0.163
- Updated dependencies (provider 3.0.0-beta.29 / gateway / provider-utils)

### 6.0.162
- feat(anthropic): add programmatic tool calling

### 6.0.161
- Updated dependencies: gateway@2.0.0-beta.87

### 6.0.160
- feat: image editing

### 6.0.159
- fix header loss when statusText is undefined in writeHead

### 6.0.158
- Updated dependencies

### 6.0.157
- feat: Standard JSON Schema support

### 6.0.156
- chore(agent): rename messages property on agent ui stream functions to uiMessages

### 6.0.155
- Updated dependencies (provider-utils@4.0.0-beta.51)

### 6.0.154
- feat: add toolCallId arg to toModelOutput

### 6.0.153
- feat: support async Tool.toModelOutput

### 6.0.152
- chore: change argument of toModelOutput to parameter object

### 6.0.151
- chore(ai): rename tool helpers

### 6.0.150
- Added schema name and description for generateText and output

### 6.0.149
- fix(gateway): throw error with user-friendly message in non-production environments if 'AI_GATEWAY_API_KEY' is not configured

### 6.0.148
- Updated dependencies: gateway@2.0.0-beta.78

### 6.0.147
- feat(ai): print model warnings in embed and embedMany

### 6.0.146
- Updated dependencies (provider-utils@4.0.0-beta.47)

### 6.0.145
- Updated dependencies: gateway@2.0.0-beta.76

### 6.0.144
- Improve ai gateway error message when api key is not present

### 6.0.143
- feat(ai): allow modifying experimental context in prepareStep
