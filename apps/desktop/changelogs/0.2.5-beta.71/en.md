# OpenLoaf Desktop 0.2.5-beta.71

> Retries the macOS arm64 build that broke in beta.70 (Apple notarisation 403). The CI pipeline also gains real fail-fast across all build jobs, plus scaffolding for future Windows/Linux arm64 builds.

## 🚀 Improvements

- **CI fail-fast across every platform.** The publish-desktop workflow now stops the entire run on the first build failure: each matrix is `fail-fast: true`, and each top-level build job ends with a `gh run cancel` step gated on `if: failure()`. Saves ~20 minutes of wasted runner time when one platform breaks.
- **Multi-arch build scripts staged.** `apps/desktop/package.json` now defines `dist:win:arm64[:ci]` and `dist:linux:arm64[:ci]`; `artifactName` for Linux / Windows now embeds `${arch}`. The CI matrix still ships x64 only — these scripts are the building blocks for adding ARM64 to the publish matrix when ready.

## 🐛 Fixes

- **macOS arm64 dmg restored.** beta.70's macOS arm64 job hit `Unexpected token 'E', "Error: HTT"... is not valid JSON` from `@electron/notarize` because the Apple Developer Program License Agreement had to be re-accepted. After re-acceptance this release rebuilds and republishes the missing arm64 artefact, so `download.json`'s `mac-arm64` link points at a real dmg again.

## ℹ️ Notes

- No app-side behaviour change.
- After this release lands, double-check `https://openloaf-1329813561.cos.accelerate.myqcloud.com/download.json` and confirm `desktop.downloads.mac-arm64.url` returns 200.
