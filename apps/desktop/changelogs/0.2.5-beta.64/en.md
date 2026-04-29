# OpenLoaf Desktop 0.2.5-beta.64

> Re-roll of 0.2.5-beta.63 — the previous tag failed CI because `keytar`'s `.node` binary tripped esbuild and was not bundled into the desktop package. Both are fixed below.

## 🔒 Security

- **SaaS refresh token now lives in the OS keychain.** In production builds the refresh token is persisted via `keytar` (macOS Keychain / Windows Credential Manager / Linux libsecret) instead of `auth.json`. Dev builds keep using `auth.dev.json` for cross-process script convenience. Native binding loads lazily so the dev path never touches `keytar`.
- **SaaS auth handshake carries client identity.** Token exchange and refresh now send a `clientInfo` payload (`appId: openloaf-server`, `platform`, `appVersion`) so the SaaS side can attribute and rate-limit per client.

## 🚀 Improvements

- **Cross-provider JSON output stabilised.** `auxiliaryInfer` no longer relies on AI SDK `Output.object` (which encodes as `response_format=json_schema`). Dashscope requires the `json` keyword in messages, DeepSeek doesn't accept `json_schema`, and Kimi silently ignores it — behaviour was inconsistent. Now we generate plain text with an inline schema hint, extract the JSON ourselves, and validate with zod for uniform results across every provider.
- **New `jsonExtract` module.** Schema-aware JSON parser used by the auxiliary pipeline; ships with focused unit tests plus a Dashscope repro and an end-to-end auxiliary web-fetch test.

## 🔧 Refactor

- **Token store fully async.** `applyTokenExchangeResult`, `setRefreshToken`, `getRefreshToken`, `clearAuthSession`, and the auth route handlers are now `async` to accommodate keychain I/O. No behaviour change for existing callers beyond awaiting these calls.

## 🐛 Build fixes (vs 0.2.5-beta.63)

- `keytar` added to the server `esbuild` external list so the `.node` native binary is no longer pulled into the bundle.
- `keytar` added to the desktop `forge.config.ts` `NATIVE_DEP_ROOTS` so the package and its native binding are copied into the packaged app's `node_modules`.

## 📦 Dependencies

- `@openloaf-saas/sdk` 0.2.4 → 0.3.2 (server / web / packages/api / root).
- `keytar ^7.9.0` added (server) — declared in root `onlyBuiltDependencies` so the native binding is built during install.
- `pnpm-lock.yaml` refreshed.
