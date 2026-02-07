# File Operations

## useProjectFileSystemModel

核心文件系统 Model，封装导航、CRUD、拖拽、搜索、排序等所有操作。

### 导航

```typescript
const model = useProjectFileSystemModel({ projectId, rootUri, tabId })

model.handleNavigate(nextUri)    // 导航到目录
model.parentUri                  // 父目录 URI
model.displayUri                 // 当前显示的目录 URI
```

### 排序

```typescript
model.sortField    // "name" | "mtime"
model.sortOrder    // "asc" | "desc"
model.handleSortByName()   // 按名称排序
model.handleSortByTime()   // 按时间排序
```

### 搜索

```typescript
model.searchValue        // 搜索关键词
model.isSearchOpen       // 搜索面板是否打开
model.setSearchValue(v)  // 设置搜索词
model.setIsSearchOpen(v) // 切换搜索面板
```

### 文件操作

```typescript
model.handleOpen(entry)           // 打开文件/文件夹
model.handleDelete(entries)       // 删除（移入回收站或系统删除）
model.handleCreateFolder()        // 创建文件夹（自动进入重命名）
model.handleCreateMarkdown()      // 创建 MDX 文件（含模板）
model.renameEntry(entry, name)    // 重命名
model.handleUploadFiles(files)    // 上传文件
```

### 拖放

```typescript
model.handleDrop(event)                // 处理外部拖入（图片/文件）
model.handleDragEnter(event)           // 拖拽进入区域
model.handleDragOver(event)            // 拖拽悬停
model.handleMoveToFolder(uris, folderUri)  // 移动到文件夹
model.handleEntryDrop(event, targetUri)    // 条目级拖放
```

### 转移对话框

```typescript
model.transferDialogOpen     // 转移对话框是否打开
model.transferEntries        // 待转移的条目列表
model.transferMode           // "copy" | "move"
model.handleOpenTransferDialog(entries, mode)  // 打开转移对话框
```

### 撤销/重做

```typescript
model.canUndo    // 是否可撤销
model.canRedo    // 是否可重做
model.undo()     // 撤销
model.redo()     // 重做
```

## 文件系统历史 (useFileSystemHistory)

### HistoryAction 类型

```typescript
type HistoryAction =
  | { kind: "rename"; from: string; to: string }
  | { kind: "copy"; from: string; to: string }
  | { kind: "mkdir"; uri: string }
  | { kind: "create"; uri: string; content?: string; contentBase64?: string }
  | { kind: "delete"; uri: string; trashUri: string }
  | { kind: "trash"; uri: string }         // 系统回收站（不可撤销 redo）
  | { kind: "batch"; actions: HistoryAction[] }
```

### 撤销逻辑

| 操作 | 撤销方式 |
|------|----------|
| `rename` | 反向重命名 `to → from` |
| `copy` | 删除目标 `to` |
| `mkdir` | 删除目录 |
| `create` | 删除文件 |
| `delete` | 从 `trashUri` 恢复 |
| `trash` | 不可恢复，提示用户 |
| `batch` | 逆序撤销所有子操作 |

### 持久化

历史栈通过 `historyStore` (Map) 按 `historyKey` 保持跨重渲染一致性，但不持久化到 localStorage。

## 文件选择 (useFileSelection)

```typescript
const { selectedUris, replaceSelection, toggleSelection, ensureSelected, clearSelection, applySelectionChange } = useFileSelection()

replaceSelection(["uri1", "uri2"])              // 替换选择
toggleSelection("uri1")                         // 切换单个
ensureSelected("uri1")                          // 确保包含
clearSelection()                                // 清空
applySelectionChange(["uri1", "uri2"], "replace" | "toggle")  // 拖拽选择结果
```

## 文件重命名 (useFileRename)

```typescript
const rename = useFileRename({
  entries,                              // 当前目录条目（用于验证）
  allowRename: (entry) => true,         // 可选过滤
  onRename: async (entry, name) => {    // 实际重命名操作
    await trpc.fs.rename.mutate(...)
    return newUri                       // 返回新 URI 用于更新选择
  },
  onSelectionReplace: (uris) => {},     // 重命名后同步选择
})

rename.requestRename(entry)             // 进入重命名状态
rename.requestRenameByInfo({ uri, name }) // 创建后立即重命名
rename.handleRenamingSubmit()           // 提交（含同名检查）
rename.handleRenamingCancel()           // 取消
rename.renamingUri                      // 当前重命名 URI
rename.renamingValue                    // 输入框值
rename.setRenamingValue(v)              // 设置输入值
```

**Board 文件夹特殊处理**：重命名时自动添加 `tnboard_` 前缀（`ensureBoardFolderName`）。

## 右键菜单 (useFileSystemContextMenu)

```typescript
const menu = useFileSystemContextMenu({
  entries,
  selectedUris,
  onReplaceSelection: replaceSelection,
  selectGuardMs: 200,                   // 防误触时间
})

menu.menuContextEntry                   // 菜单目标条目快照
menu.isContextMenuOpen                  // 是否打开
menu.handleGridContextMenuCapture(event, { uri, entry? })  // 捕获目标
menu.handleContextMenuOpenChange(open)  // 追踪开关状态
menu.withMenuSelectGuard(handler)       // 包装菜单项动作（防右键抬起误触）
menu.resetContextMenu()                 // 目录切换时重置
```

**关键行为**：
- 右键按下时快照目标条目，避免菜单关闭动画期间内容闪烁
- 200ms 选择防护，防止右键抬起立即触发菜单项

## 拖拽协议

### MIME 类型

```typescript
FILE_DRAG_URI_MIME   // 单文件 URI
FILE_DRAG_URIS_MIME  // 多文件 URI（JSON 数组）
FILE_DRAG_REF_MIME   // 拖拽引用标记
```

### 拖拽预览

多选拖拽时构建堆叠预览（最多前 3 个缩略图），区分图片和文件的拖拽行为。

### Electron 特殊处理

Electron 环境下拖拽使用本地文件路径，Web 环境使用 DataTransfer 数据。

### 拖拽会话

```typescript
setProjectFileDragSession(session)     // 设置拖拽会话
getProjectFileDragSession()            // 获取当前会话
matchProjectFileDragSession(event)     // 匹配拖拽事件
clearProjectFileDragSession()          // 清除会话
```

## 框选 (useFileSystemSelection)

```typescript
const selection = useFileSystemSelection({
  entries,
  selectedUris,
  onSelectionChange: applySelectionChange,
})

selection.selectionRect          // 框选矩形状态 {x,y,w,h} | null
selection.registerEntryRef(uri)  // 注册条目 DOM 节点（碰撞检测）
selection.handleGridMouseDown(e) // 启动框选
```

**特点**：4px 阈值防止意外激活框选。

## 内存剪贴板

```typescript
// file-system-model.ts 模块级变量
let fileClipboard: FileSystemEntry[] | null = null

// 复制：fileClipboard = selectedEntries
// 粘贴：遍历 fileClipboard 执行 copy 操作
```

注意：剪贴板为内存级别，刷新页面后丢失。

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 重命名不检查同名 | `handleRenamingSubmit` 已包含同名检查 |
| 直接 `fs.delete` 不记录历史 | 通过 Model 操作自动推入历史栈 |
| Board 文件夹重命名丢失前缀 | 使用 `ensureBoardFolderName()` |
| 拖拽不区分 Electron/Web | 检查 `isElectronEnv()` 决定拖拽行为 |
| 右键菜单闪烁 | 使用 `menuContextEntry` 快照而非实时查询 |
| 撤销 trash 操作 | `trash` 类型操作不可 redo，需提示用户 |
| blur 和 Enter 重复提交重命名 | `isSubmittingRef` 已防护 |
