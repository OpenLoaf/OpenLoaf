# Backend API

## tRPC fs 路由速查

位置：`packages/api/src/routers/fs.ts`

所有操作使用 `shieldedProcedure`，需要 `workspaceId`（必需）+ `projectId`（可选）作用域。

## 查询操作 (Query)

### stat

获取文件/目录元数据。

```typescript
trpc.fs.stat.queryOptions({ workspaceId, projectId, uri })
// → { name, kind, uri, ext, size, createdAt, updatedAt, isEmpty? }
```

### list

列出目录内容。

```typescript
trpc.fs.list.queryOptions({
  workspaceId, projectId, uri,
  includeHidden?: boolean,
  sort?: { field: "name" | "mtime", order: "asc" | "desc" }
})
// → { entries: FileNode[] }
```

**排序规则**：
- `name`: 普通文件夹 > Board 文件夹 > 文件，同级按名称 locale 排序
- `mtime`: 全量按修改时间排序

### readFile

读取文本文件。

```typescript
trpc.fs.readFile.queryOptions({ workspaceId, projectId, uri })
// → { content: string, tooLarge?: boolean }
```

**大小限制**：50 MB (`READ_FILE_MAX_BYTES`)，超过返回 `{ content: "", tooLarge: true }`。
**ENOENT**：文件不存在返回 `{ content: "" }`。

### readBinary

读取二进制文件（Base64）。

```typescript
trpc.fs.readBinary.queryOptions({ workspaceId, projectId, uri })
// → { contentBase64: string, mime: string }
```

### search

在目录内搜索文件。

```typescript
trpc.fs.search.queryOptions({
  workspaceId, projectId, rootUri,
  query: string,
  includeHidden?: boolean,
  limit?: number,       // 默认 500，最大 2000
  maxDepth?: number,    // 默认 12，最大 50
})
// → { results: FileNode[] }
```

**搜索逻辑**：递归遍历，文件名 `toLowerCase().includes(query)`，Board 文件夹使用显示名匹配。
**忽略目录**：`node_modules`, `.git`, `.turbo`, `.next`, `.tenas-trash`, `dist`, `build`, `out`。

### searchWorkspace

跨项目搜索。

```typescript
trpc.fs.searchWorkspace.queryOptions({
  workspaceId, query, includeHidden?, limit?, maxDepth?
})
// → { results: [{ projectId, projectTitle, entry, relativePath }] }
```

### thumbnails

批量生成缩略图（40×40 webp）。

```typescript
trpc.fs.thumbnails.queryOptions({
  workspaceId, projectId,
  uris: string[]     // 最多 50 个
})
// → { items: [{ uri, dataUrl }] }
```

**处理方式**：
- 图片：sharp resize 40×40 + webp quality 45
- 视频：ffmpeg 抽帧 → 缓存（SHA-256 key）

### folderThumbnails

获取目录内所有文件的缩略图。

```typescript
trpc.fs.folderThumbnails.queryOptions({
  workspaceId, projectId, uri,
  includeHidden?: boolean
})
// → { items: [{ uri, dataUrl }] }
```

**包含**：图片 + Board 文件夹的 `index.png` + 视频抽帧。

### videoMetadata

获取视频尺寸（ffprobe）。

```typescript
trpc.fs.videoMetadata.queryOptions({ workspaceId, projectId, uri })
// → { width: number | null, height: number | null }
```

## 变更操作 (Mutation)

### writeFile

写入文本文件。

```typescript
trpc.fs.writeFile.mutate({ workspaceId, projectId, uri, content: string })
// → { ok: true }
// 自动创建父目录
```

### writeBinary

写入二进制文件（Base64）。

```typescript
trpc.fs.writeBinary.mutate({ workspaceId, projectId, uri, contentBase64: string })
// → { ok: true }
```

### mkdir

创建目录。

```typescript
trpc.fs.mkdir.mutate({ workspaceId, projectId, uri, recursive?: boolean })
// → { ok: true }
// 默认 recursive: true
```

### rename

重命名/移动。

```typescript
trpc.fs.rename.mutate({ workspaceId, projectId, from: string, to: string })
// → { ok: true }
// 自动创建目标父目录
```

### copy

复制文件/目录（递归）。

```typescript
trpc.fs.copy.mutate({ workspaceId, projectId, from: string, to: string })
// → { ok: true }
```

### delete

删除文件/目录。

```typescript
trpc.fs.delete.mutate({ workspaceId, projectId, uri, recursive?: boolean })
// → { ok: true }
// 默认 recursive: true, force: true
```

### importLocalFile

从本地路径导入文件（Electron）。

```typescript
trpc.fs.importLocalFile.mutate({ workspaceId, projectId, uri, sourcePath: string })
// → { ok: true }
// 支持 file:// URL，必须是绝对路径且为文件
```

### appendBinary

追加二进制数据。

```typescript
trpc.fs.appendBinary.mutate({ workspaceId, projectId, uri, contentBase64: string })
// → { ok: true }
```

## 视频缩略图缓存

```
~/.tenas/.tenas-cache/video-thumbs/
└── {sha256_hash}.jpg    // SHA-256(relativePath + size + mtimeMs)
```

- 缩略图尺寸：320×180
- 使用 ffmpeg 抽取第 1 秒帧
- 命中缓存直接读取，避免重复抽帧

## 路径解析

```typescript
// 服务端路径解析链路
resolveFsRootPath(input)          // workspaceId + projectId → 项目根路径
resolveFsTarget(input, uri)       // 根路径 + uri → 完整文件系统路径
toRelativePath(rootPath, fullPath) // 转为相对 URI

// 安全检查
resolveScopedPath()               // 确保路径不越界
```

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 不传 `workspaceId` | 所有 fs 操作必需 `workspaceId` |
| 大文件直接 readFile | 检查 `tooLarge` 字段，超 50MB 用系统打开 |
| thumbnails 超 50 个 URI | 分批请求，每批最多 50 |
| 搜索不设 limit | 默认 500，大目录可能慢 |
| copy 不处理同名 | 前端需要 `getUniqueName()` 处理 |
| importLocalFile 用相对路径 | 必须是绝对路径 |
