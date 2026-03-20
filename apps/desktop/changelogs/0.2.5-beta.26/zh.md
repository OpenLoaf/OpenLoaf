---
version: 0.2.5-beta.26
date: 2026-03-21
---

## 0.2.5-beta.26

### 🐛 问题修复

- **自动更新架构修复**：修复 Apple Silicon (ARM64) Mac 在自动更新时下载 Intel (x64) 版本的严重问题。`electron-updater` 的 generic provider 始终读取 `latest-mac.yml`，此前该文件仅包含 x64 条目。现在 `latest-mac.yml` 同时包含 ARM64 和 x64 条目，`MacUpdater` 可自动选择正确架构。

### 🚀 改进

- **画布缩放范围**：最大缩放倍数从 2.0x 提升至 2.2x，便于查看细节。

### 🔧 维护

- 升级所有 CI 工作流的 GitHub Actions 版本（checkout v6、setup-node v6、pnpm/action-setup v5、CodeQL v4）。
