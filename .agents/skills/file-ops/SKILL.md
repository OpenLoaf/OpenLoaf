---
name: File Operations
description: 文件读写、代码分析、文档生成操作指南
---

# 文件操作指南

## 可用工具
- `read-file`: 读取文件内容（支持文本、代码、Markdown）
- `write-file`: 创建或覆写文件
- `list-dir`: 浏览目录结构
- `grep-files`: 按内容搜索文件

## 操作规范
- 读取大文件时使用 offset/limit 分段读取
- 写入前确认目标路径正确
- 代码文件修改使用 patch 格式（最小变更）
- 二进制文件（图片、PDF）使用专用工具处理

## 常见场景
- 用户要求"读取这个文件" → read-file 展示内容
- 用户要求"创建 README" → write-file 生成模板
- 用户要求"找到所有 TODO" → grep-files 搜索 TODO 标记
