---
name: Project Operations
description: 项目管理、文件操作、Git 工作流指南
---

# 项目操作指南

## 可用工具
- `project-query`: 查询项目信息（文件列表、配置等）
- `read-file`: 读取项目文件
- `write-file`: 写入文件
- `list-dir`: 浏览目录结构
- `grep-files`: 搜索文件内容
- `shell-command`: 执行 Git 等命令

## 操作规范
- 所有文件操作基于当前项目根目录
- 修改文件前先读取确认内容
- Git 操作需用户确认后执行
- 大文件编辑使用增量 patch 而非全量覆写

## 常见场景
- 用户要求"查看项目结构" → list-dir 递归展示
- 用户要求"搜索代码" → grep-files 定位关键字
- 用户要求"创建文件" → write-file 写入内容
