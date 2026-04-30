# OpenLoaf Desktop 0.2.5-beta.68

> Adds a website-friendly `download-{channel}.json` index so the official site can render the latest download buttons by fetching a single JSON. No app-side behaviour change for end users.

## 🚀 Improvements

- **`download-beta.json` / `download-stable.json` published per release.** The `publish-finalize` step in `publish-update.mjs` now writes a flat JSON containing the latest desktop version, per-platform installer URLs (dmg / exe / AppImage), R2 + COS mirror links, the GitHub Release tag URL, and the bundled web / server versions. Available at:
  - `https://openloaf-1329813561.cos.accelerate.myqcloud.com/download-beta.json`
  - `https://openloaf-update.hexems.com/download-beta.json`
  - `…/download-stable.json` once the next stable ships.
- The index is regenerated at every `--manifest-only` finalize, mirrored to both R2 and COS, and prefers COS in the default `url` field so mainland users hit the accelerate edge first.

## ℹ️ Notes

- Schema is intentionally flat and includes raw `mirrors.{cos,r2,github}` so a static site can do `fetch('/download-beta.json').then(r => r.json())` and bind URLs without bespoke parsing.
- `sha256` for the user-facing dmg/exe/AppImage is currently `null` — electron-updater verifies via the side `.blockmap` / sha512 channel. If we need a sha256 for website integrity badges, capture it during the per-platform upload step.
