# OpenLoaf Desktop 0.2.5-beta.69

> Adds the website-friendly aggregate `download.json` (stable-preferred, falls back to beta when no stable exists). The website can now fetch a single stable URL forever — no app-side change for end users.

## 🚀 Improvements

- **`download.json` aggregate index.** On top of the channel-specific `download-beta.json` / `download-stable.json` introduced in beta.68, the `publish-finalize` step now also writes `download.json`:
  - When publishing **stable**, it always overwrites `download.json` with the stable payload.
  - When publishing **beta**, it only writes `download.json` if no `download-stable.json` exists yet — so once a stable ships, future beta releases will not drag the website headline back to a prerelease.
  - Both are mirrored to R2 and COS.
- The website can settle on `https://openloaf-1329813561.cos.accelerate.myqcloud.com/download.json` as a permanent URL; advanced users / beta testers can still target `download-beta.json` directly.

## ℹ️ Notes

- This release is the first to write the aggregate `download.json` — its content currently mirrors `download-beta.json` because no stable has shipped yet. Once a stable ships, `download.json` will switch to that and stay there until a newer stable comes out.
- Schema is identical to `download-{channel}.json`; only the URL differs.
