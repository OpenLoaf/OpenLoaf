# 垃圾代码清理清单

> 按优先级排列，每项标注文件位置和具体行为。

## P0 — 数据一致性问题（必须修）

### 1. prompt 字段位置不一致
- **文件**: `ImgGenRefVariant.tsx`
- **问题**: prompt 同时出现在 `inputs.prompt` 和 `params.prompt`
- **修复**: 移除 `params.prompt`，统一只用 `inputs.prompt`

### 2. aiConfig.taskId 冗余
- **文件**: `board-contracts.ts` (AiGenerateConfig.taskId)
- **问题**: 与 `versionStack.entry.taskId` 重复存储
- **修复**: 删除 `aiConfig.taskId`，统一从 versionStack 读取

### 3. aiConfig.results 冗余
- **文件**: `board-contracts.ts` (AiGenerateConfig.results/selectedIndex)
- **问题**: 与 `versionStack.output.urls` 功能重复
- **修复**: 删除 `aiConfig.results` 和 `selectedIndex`，统一用 versionStack

### 4. InputSnapshot.upstreamRefs.nodeId 空值
- **文件**: ImageNode/VideoNode 中 createInputSnapshot 调用
- **问题**: `nodeId` 始终为空字符串 `''`
- **修复**: 传入真实的源节点 ID

## P1 — 代码重构

### 5. ImagePanelMode deprecated 导出
- **文件**: `ImageAiPanel.tsx` L52-53
- **代码**: `export type ImagePanelMode = string`
- **操作**: 删除

### 6. VideoGenerateParams deprecated 字段
- **文件**: `ImageAiPanel.tsx` L46-68
- **字段**: prompt, aspectRatio, duration, quality, mode, withAudio, firstFrameImageSrc
- **操作**: 确认无外部引用后删除

### 7. AiGenerateConfig 过时枚举值
- **文件**: `board-contracts.ts`
- **过时值**: poster, matting, digitalHuman, motionTransfer, music, sfx, videoEdit
- **操作**: 移除未使用的枚举值

### 8. editingUnlockedIds 全局 Set
- **文件**: `ImageNode.tsx`（模块级）
- **问题**: 跨组件生命周期的全局可变状态
- **操作**: 改为 engine context 或 aiConfig.isEditing

### 9. localhost URL 处理分支
- **文件**: `media-upload.ts` (resolveOneMediaInput)
- **问题**: `http://127.0.0.1` 分支已 deprecated
- **操作**: 删除整个分支

### 10. 后端 resolvePayloadMediaInputs 旧逻辑
- **文件**: `mediaProxy.ts`
- **问题**: 前端已全部走 path-based upload，后端旧 payload 处理无用
- **操作**: 确认无调用后删除

## P2 — 重复代码提取

### 11. Source image 解析重复
- **涉及**: ImgStyleVolcVariant, UpscaleQwenVariant, UpscaleVolcVariant, OutpaintQwenVariant
- **重复代码**:
  ```typescript
  const rawSourceUrl = nodeResourceUrl ?? upstream.images?.[0]
  const [imgLoadFailed, setImgLoadFailed] = useState(false)
  useEffect(() => { setImgLoadFailed(false) }, [rawSourceUrl])
  const sourceUrl = imgLoadFailed ? undefined : rawSourceUrl
  const sourcePath = nodeResourcePath ?? upstream.imagePaths?.[0]
  ```
- **操作**: 提取 `useSourceImage(nodeResourcePath, nodeResourceUrl, upstream)` hook

### 12. Manual images 管理重复
- **涉及**: ImgGenRefVariant, ImgEditWanVariant, ImgEditPlusVariant
- **重复代码**: manualImages state + displayImages + apiImages 拼接 + MediaSlot 渲染
- **操作**: 提取 `useMediaSlots(max, nodeImage, upstream)` hook

### 13. 版本堆叠工具栏重复
- **涉及**: ImageNode, VideoNode, AudioNode
- **重复代码**: getPrimaryEntry + getGeneratingEntry + toolbar items
- **操作**: 提取 `useVersionStackToolbar(stack, onUpdate)` hook

### 14. Upstream 双套图片格式
- **文件**: `variants/types.ts` (VariantUpstream)
- **问题**: `images` (resolved URL) 和 `imagePaths` (board-relative) 两套
- **操作**: 统一为 `imagePaths`，variant 需要显示时自己 resolve

## P3 — 可选优化

### 15. 5 个 deprecated 节点类型
- **类型**: chat_input, chat_message, image_generate, video_generate, image_prompt_generate
- **操作**: 添加迁移脚本或静默删除

### 16. MIME 类型映射不完整
- **文件**: `mediaProxy.ts` MEDIA_TYPE_MAP
- **缺少**: .webm, .aac, .flac, .mov
- **操作**: 补全或使用 mime-types 库

### 17. asset 目录无 GC
- **问题**: 删除节点后关联的 asset 文件不清理
- **操作**: 实现孤立文件扫描 + 定期清理
