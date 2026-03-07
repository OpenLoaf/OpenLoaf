---
version: 0.2.5-beta.5
date: 2026-03-07
---

## ✨ 新功能

- 画布右键菜单：支持复制路径、重命名、移动到项目、AI 命名、删除
- 画布列表（Canvas/Mixed）新增完整的上下文菜单操作

## 🚀 改进

- AI 命名画布现在通过 SaaS 认证传递 access token，未登录时引导登录
- 聊天反馈提交简化为 SDK 直连，移除 HTTP fallback
- 临时对话不再显示历史记录按钮
- Board snapshot 转 Markdown 支持更多节点属性格式（image、image_generate 等）
- `boardFolderUri` 支持 `file://` URI 格式解析

## 💄 界面优化

- 侧边栏项目树骨架屏颜色调整

## 🌐 国际化

- README 主语言切换为英文
- 新增画布管理相关翻译键（复制路径、移动到项目等）

## 🐛 问题修复

- 修复 CLI 工具版本提取在无匹配时返回原始字符串而非 null 的问题
- 修复 `inferBoardName` 请求缺少 requestContext 导致的认证问题

## 📦 依赖更新

- 更新 server、web、api 包依赖版本
