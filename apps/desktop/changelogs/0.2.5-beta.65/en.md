# OpenLoaf Desktop 0.2.5-beta.65

> Hotfix for 0.2.5-beta.64 — WeChat / SaaS login was broken on every platform (macOS / Windows / Linux) because of a CJS/ESM interop oversight when loading `keytar`. Upgrade strongly recommended.

## 🐛 Fixes

- **WeChat / SaaS login restored.** In 0.2.5-beta.64 the OAuth code exchange completed against the SaaS side but `POST /auth/exchange` then failed locally with `keytar.setPassword is not a function`, leaving the desktop app unable to persist the SaaS refresh token. The bug was platform-independent — Keychain (macOS) / Credential Manager (Windows) / libsecret (Linux) were never reached because the JS layer threw first.
  - Root cause: `apps/server/src/modules/settings/openloafConfStore.ts` did `await import("keytar")` against an ESM bundle. `keytar` is a CJS package, so the named exports landed under `.default` instead of being hoisted to the namespace, and `keytar.setPassword` resolved to `undefined`.
  - Fix: take `m.default ?? m` from the dynamic import so the same shape works in both CJS and ESM hosts. One-line change, no behaviour difference on the dev path.

## ℹ️ Notes

- No schema or API changes. Bundled server / web binaries are rebuilt to pick up the fix.
- Users who already exchanged a code on 0.2.5-beta.64 do not need to do anything special — log in again and the refresh token will be written to the OS keychain on first success.
