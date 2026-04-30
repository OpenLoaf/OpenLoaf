# OpenLoaf Desktop 0.2.5-beta.71

> 重发 beta.70 失败的 macOS arm64 包（Apple 公证 403）。CI 同时获得真正的"任一平台失败立即停"能力，并预先铺好未来 Windows / Linux arm64 构建的脚手架。

## 🚀 改进

- **CI 任一平台失败立即停。** publish-desktop workflow 现在在第一次 build 失败时就停掉整个 run：每个 matrix 都是 `fail-fast: true`，每个顶层 build job 末尾还有 `if: failure()` 的 `gh run cancel` 兜底，跨 job fail-fast 也能生效。一旦有平台失败，不会再继续浪费 20 多分钟跑剩下的。
- **多 arch 构建脚本铺好。** `apps/desktop/package.json` 新增 `dist:win:arm64[:ci]` / `dist:linux:arm64[:ci]`；Linux / Windows 的 `artifactName` 内嵌 `${arch}`。当前 CI 矩阵仍只发 x64，这些脚本是后续把 ARM64 加进发布矩阵的准备工作。

## 🐛 修复

- **macOS arm64 dmg 恢复。** beta.70 macOS arm64 job 报 `Unexpected token 'E', "Error: HTT"... is not valid JSON`，是 Apple Developer Program License Agreement 需要重新接受。接受后本次重新构建并上传 arm64 dmg，`download.json` 的 `mac-arm64` 链接重新指向有效文件。

## ℹ️ 说明

- 无业务代码变化。
- 本版本落地后请验证 `https://openloaf-1329813561.cos.accelerate.myqcloud.com/download.json` 中 `desktop.downloads.mac-arm64.url` 能 200 访问。
