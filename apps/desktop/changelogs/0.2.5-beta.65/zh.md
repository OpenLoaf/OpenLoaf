# OpenLoaf Desktop 0.2.5-beta.65

> 0.2.5-beta.64 的紧急修复 — `keytar` 加载层 CJS/ESM 互操作疏漏导致**全平台**（macOS / Windows / Linux）无法登录微信 / SaaS。强烈建议升级。

## 🐛 修复

- **恢复微信 / SaaS 登录。** 在 0.2.5-beta.64 上，OAuth code 在 SaaS 侧已成功换取，但本地 `POST /auth/exchange` 紧接着抛出 `keytar.setPassword is not a function`，导致桌面端无法保存 SaaS refresh token。该 bug 与平台无关 — Keychain（macOS）/ Credential Manager（Windows）/ libsecret（Linux）压根没有被调用到，错在更上层的 JS 加载阶段。
  - 根因：`apps/server/src/modules/settings/openloafConfStore.ts` 用 `await import("keytar")` 加载，server 是 ESM bundle，而 `keytar` 是 CJS 包；其 named exports 没有被提升到命名空间顶层，全部落在 `.default` 下，于是 `keytar.setPassword` 拿到的是 `undefined`。
  - 修复：动态 import 取 `m.default ?? m`，CJS/ESM 两种宿主下都可用。改动一行，dev 路径无任何行为变化。

## ℹ️ 备注

- 无 schema / API 变化。Desktop 内置 server / web 产物重新构建以包含本次修复。
- 已在 0.2.5-beta.64 上换过 code 的用户无需特殊处理 — 重新登录一次，refresh token 会在首次成功后写入系统 keychain。
