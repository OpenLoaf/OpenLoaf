# OpenLoaf Desktop 0.2.5-beta.67

> Cuts the auto-update default endpoint over to Tencent COS so fresh installs in mainland China get noticeably faster downloads. Cloudflare R2 keeps mirroring every release for older clients and overseas users.

## 🚀 Improvements

- **Default update endpoint switched to Tencent COS.** New installs now resolve `https://openloaf-1329813561.cos.accelerate.myqcloud.com` for both the Electron auto-updater and the in-app web UI. CI continues to dual-publish to R2 and COS, so the existing `https://openloaf-update.hexems.com` mirror stays current — clients pinned to it via `OPENLOAF_UPDATE_URL` keep working.
- **`@openloaf-saas/sdk` bumped to ^0.3.9** across server, web and `packages/api`. Picks up upstream chat / media-task fixes; no API changes on the OpenLoaf side.

## 🐛 Fixes

- **Stray branch-snapshot query on first paint.** `ChatCoreProvider` / `useChatBranchState` now require a resolved `sessionId` before the branch snapshot tRPC query fires. Previously a request could sneak out before the session id was hydrated, hitting the server with an empty id and surfacing a noisy 400 in the network tab.

## ℹ️ Notes

- Old installs (≤ 0.2.5-beta.65) still pull updates from R2 and will continue to receive every future release — the cutover is opt-in via reinstall, not forced.
- If you need to override the endpoint (corp proxy, staging, etc.), set `OPENLOAF_UPDATE_URL` either as an env var or in `runtime.env`. The override is honoured ahead of the new COS default.
