# OpenLoaf Desktop 0.2.5-beta.63

## 🔒 安全

- **SaaS refresh token 改存系统钥匙串。** 生产构建通过 `keytar` 写入 macOS Keychain / Windows Credential Manager / Linux libsecret，不再落 `auth.json`。开发构建仍用 `auth.dev.json`，方便本地脚本跨进程复用。`keytar` native binding 按需懒加载，dev 路径完全不触碰它。
- **SaaS 认证握手携带客户端身份。** Token 交换 / 刷新统一带上 `clientInfo`（`appId: openloaf-server`、`platform`、`appVersion`），SaaS 侧得以按客户端归因与限流。

## 🚀 改进

- **跨 provider JSON 输出统一。** `auxiliaryInfer` 不再依赖 AI SDK 的 `Output.object`（会编码为 `response_format=json_schema`）：Dashscope 要求 messages 含 `json`、DeepSeek 不支持 `json_schema`、Kimi 直接无视，行为不一致。改为生成纯文本 + 提示词内嵌 schema 描述 + 自行抽取 JSON + zod 校验，所有 provider 行为一致。
- **新增 `jsonExtract` 模块。** Schema-aware 的 JSON 解析器，给辅助推理管线使用；附带单元测试，以及 Dashscope JSON 复现脚本和 auxiliary webfetch 端到端测试。

## 🔧 重构

- **TokenStore 全面 async 化。** `applyTokenExchangeResult`、`setRefreshToken`、`getRefreshToken`、`clearAuthSession` 以及 auth 路由 handler 改为 `async`，以承接 keychain I/O。除调用方需要 `await` 之外无行为变化。

## 📦 依赖

- `@openloaf-saas/sdk` 0.2.4 → 0.3.2（server / web / packages/api / 根）。
- 新增 `keytar ^7.9.0`（server），在根 `onlyBuiltDependencies` 中声明，保证安装期编译 native binding。
- `pnpm-lock.yaml` 已刷新。
