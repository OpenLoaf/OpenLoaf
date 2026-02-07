---
name: file-system-development
description: Use when developing, extending, or debugging the file preview/viewer system, file system operations, file browser UI, or backend fs tRPC routes — adding viewers, file operations, drag-drop, context menus, or fixing preview/upload/download issues
---

# File System Development

## Overview

Tenas 的文件系统由**预览查看器**（11 种 Viewer 组件）、**文件操作模型**（CRUD/拖拽/历史）、**预览分发系统**（Store + 类型路由 + 三种打开模式）、**后端 tRPC 路由**四层构成。

## When to Use

- 添加或修改文件查看器（image/video/code/markdown/pdf/doc/sheet/terminal）
- 修改文件打开逻辑、预览弹窗、Stack 面板集成
- 修改文件系统操作（CRUD、拖拽、重命名、复制粘贴、撤销重做）
- 修改文件选择、框选、右键菜单行为
- 修改后端 `fs` tRPC 路由（读写/缩略图/搜索）
- 调试文件预览、大文件处理、Office 文件路由问题

## Architecture

```
用户交互 (文件双击/右键/拖拽)
        ↓
openFilePreview() — 统一入口
   ├─ resolveFileViewerTarget() — 扩展名→Viewer 类型映射
   ├─ shouldOpenOfficeWithSystem() — Office 文件系统打开检查
   └─ 模式分发
       ├─ "stack" → pushStackItem() → Tab Stack 面板
       ├─ "modal" → openFilePreviewDialog() → Zustand Store → FilePreviewDialog
       └─ "embed" → renderFilePreviewContent() → 嵌入式 ReactNode

文件系统管理 (project/filesystem/)
   ├─ useProjectFileSystemModel — 核心 Model (CRUD/导航/排序/搜索)
   ├─ useFileSystemHistory — 撤销/重做栈
   ├─ useFileSelection / useFileRename — 选择/重命名状态
   ├─ useFileSystemContextMenu — 右键菜单
   └─ useFileSystemDrag / useFileSystemSelection — 拖拽/框选

后端 (packages/api/src/routers/fs.ts)
   └─ tRPC fs router — stat/list/search/read/write/mkdir/rename/copy/delete/thumbnails
```

## Detailed References

| 文件 | 内容 | 查阅时机 |
|------|------|----------|
| [viewer-development.md](viewer-development.md) | Viewer 开发指南、类型映射、Props 模式、错误处理 | 添加/修改文件查看器 |
| [file-operations.md](file-operations.md) | Model API、CRUD、拖拽、历史、选择、重命名 | 文件操作功能开发 |
| [preview-system.md](preview-system.md) | Store、打开模式、类型路由、最近打开 | 预览/打开逻辑修改 |
| [backend-api.md](backend-api.md) | tRPC fs 路由 API 速查 | 后端文件操作开发 |

## Key Files Map

```
apps/web/src/components/file/
├── FilePreviewDialog.tsx        ← 全局预览弹窗 (306行)
├── FileViewer.tsx               ← 通用文件查看器 (183行)
├── ImageViewer.tsx              ← 图像查看器+编辑/蒙版 (1074行)
├── CodeViewer.tsx               ← Monaco 代码编辑器 (673行)
├── MarkdownViewer.tsx           ← Streamdown 渲染 (577行)
├── DocViewer.tsx                ← Plate.js 文档编辑 (468行)
├── SheetViewer.tsx              ← Univer 表格编辑 (681行)
├── ExcelViewer.tsx              ← SheetJS 表格查看 (503行)
├── PdfViewer.tsx                ← react-pdf 查看 (244行)
├── VideoViewer.tsx              ← HLS 视频播放 (453行)
├── TerminalViewer.tsx           ← xterm 终端模拟 (605行)
├── ImagePreviewDialog.tsx       ← 图像预览弹窗 (103行)
├── MaskedImage.tsx              ← 蒙版图层 (54行)
└── lib/
    ├── file-preview-store.ts    ← Zustand 全局预览状态
    ├── file-preview-types.ts    ← 核心类型定义
    ├── file-viewer-target.ts    ← 扩展名→Viewer 映射
    ├── open-file.ts             ← 文件打开入口 (483行)
    ├── open-file-preview.tsx    ← 嵌入式预览渲染
    ├── read-file-error.tsx      ← 错误 fallback UI
    ├── recent-open.ts           ← 最近打开管理
    ├── viewer-shortcuts.ts      ← 快捷键处理
    └── video-metadata.ts        ← 视频元数据提取

apps/web/src/hooks/
├── use-file-rename.ts           ← 重命名状态管理
├── use-file-selection.ts        ← 选择状态管理
├── use-file-system-context-menu.ts ← 右键菜单状态
└── use-upload-file.ts           ← 文件上传

apps/web/src/components/project/filesystem/
├── models/
│   ├── file-system-model.ts     ← 核心 Model (CRUD/导航/排序/搜索)
│   └── file-system-history.ts   ← 撤销/重做历史栈
├── hooks/
│   ├── use-file-system-drag.ts  ← 拖拽交互
│   ├── use-file-system-selection.ts ← 框选管理
│   └── use-file-system-preview.ts   ← 预览面板
└── utils/
    ├── file-system-utils.ts     ← URI/路径工具函数
    ├── entry-sort.ts            ← 排序逻辑
    └── entry-open.ts            ← 打开逻辑

packages/api/src/routers/fs.ts  ← 后端 tRPC 路由 (~800行)
```

## Skill Sync Policy

**当以下文件发生变更时，应检查并同步更新本 skill：**

| 变更范围 | 需更新的文件 |
|----------|-------------|
| `file-preview-types.ts` 类型变更 | preview-system.md, viewer-development.md |
| `file-viewer-target.ts` 映射变更 | viewer-development.md |
| `open-file.ts` 打开逻辑变更 | preview-system.md |
| `file-preview-store.ts` Store 变更 | preview-system.md |
| `open-file-preview.tsx` 嵌入渲染变更 | viewer-development.md |
| `read-file-error.tsx` 错误处理变更 | viewer-development.md |
| 新增 Viewer 组件 | viewer-development.md (现有 Viewer 参考表) |
| `file-system-model.ts` Model 变更 | file-operations.md |
| `file-system-history.ts` 历史变更 | file-operations.md |
| `use-file-rename.ts` / `use-file-selection.ts` 变更 | file-operations.md |
| `use-file-system-context-menu.ts` 变更 | file-operations.md |
| `use-file-system-drag.ts` / `use-file-system-selection.ts` 变更 | file-operations.md |
| `packages/api/src/routers/fs.ts` 路由变更 | backend-api.md |
| 新增 tRPC fs 操作 | backend-api.md |

**同步规则**: 修改上述文件后，在提交前检查对应 skill 文件是否需要更新。保持 skill 与代码一致。
