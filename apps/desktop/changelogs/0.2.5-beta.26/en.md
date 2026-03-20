---
version: 0.2.5-beta.26
date: 2026-03-21
---

## 0.2.5-beta.26

### 🐛 Bug Fixes

- **Auto-update architecture fix**: Fixed a critical issue where Apple Silicon (ARM64) Macs would download the Intel (x64) build during auto-update. `electron-updater`'s generic provider always reads `latest-mac.yml`, which previously only contained x64 entries. Now `latest-mac.yml` includes both ARM64 and x64 entries, allowing `MacUpdater` to automatically select the correct architecture.

### 🚀 Improvements

- **Canvas zoom range**: Increased maximum zoom level from 2.0x to 2.2x for finer detail inspection.

### 🔧 Maintenance

- Upgraded GitHub Actions versions across all CI workflows (checkout v6, setup-node v6, pnpm/action-setup v5, CodeQL v4).
