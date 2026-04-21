# @ai-sdk/react

升级：`3.0.144` → `3.0.170`

## 变更摘要

- `useObject` 支持 headers 作为 async function 或 function，实现动态 header（如异步拉取 auth token）且不会触发 hook 重新渲染。
- 修复 `useChat` 使用过期闭包问题：现在 `onToolCall` 等回调始终引用最新版本。
- 其余版本几乎全部为 `ai` core 包的依赖跟随升级（6.0.143 → 6.0.168）。

## 原始 changelog 摘录

### 3.0.170
- Updated dependencies; ai@6.0.168

### 3.0.169
- ai@6.0.167

### 3.0.168
- Updated dependencies; ai@6.0.166

### 3.0.167
- ai@6.0.165

### 3.0.166
- ai@6.0.164

### 3.0.165
- ai@6.0.163

### 3.0.164
- feat(react): support async/function headers in useObject. `useObject` 现在接受 headers 作为 async function，可动态生成 header（例如拉取 auth token）且不会触发 hook re-render。

### 3.0.163
- ai@6.0.161

### 3.0.162
- ai@6.0.160

### 3.0.161
- ai@6.0.159

### 3.0.160
- Fix: ensure `useChat` uses the latest `onToolCall` (and other callbacks) to avoid stale closures.

### 3.0.159
- Updated dependencies; ai@6.0.157

### 3.0.158
- ai@6.0.156

### 3.0.157
- Updated dependencies; ai@6.0.155

### 3.0.156
- ai@6.0.154

### 3.0.155
- Updated dependencies; ai@6.0.153

### 3.0.154
- Updated dependencies; ai@6.0.152

### 3.0.153
- ai@6.0.151

### 3.0.152
- Updated dependencies; ai@6.0.150

### 3.0.151
- ai@6.0.149

### 3.0.150
- ai@6.0.148

### 3.0.149
- Updated dependencies; @ai-sdk/provider-utils@4.0.23; ai@6.0.147

### 3.0.148
- ai@6.0.146

### 3.0.147
- ai@6.0.145

### 3.0.146
- Updated dependencies; @ai-sdk/provider-utils@4.0.22; ai@6.0.144

### 3.0.145
- ai@6.0.143
