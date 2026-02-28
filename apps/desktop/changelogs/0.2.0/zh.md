---
version: 0.2.0
date: 2026-02-28
---

## 新功能

- 新增 macOS Intel (x64) 构建支持
- 新增 Linux AppImage 构建
- 改进 CI/CD 流水线，支持多平台并行构建
- 新增自动创建 GitHub Release 并附带安装包下载

## 改进

- 优化构建性能：pnpm store 缓存 + 按需安装依赖
- 统一各平台安装包命名规范
- 桌面构建中配置 SaaS 地址环境变量
