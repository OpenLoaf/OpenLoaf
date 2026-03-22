# 垃圾代码清理清单

> 按优先级排列，每项标注文件位置和具体行为。
> 最后更新：Phase 1-4 完成后

## P0 — 数据一致性问题 ✅ 全部完成

> 以下 4 项已在 Phase 1 中修复并提交。

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

## P1 — 代码重构（大部分已完成）

### 5. ✅ ImagePanelMode deprecated 导出 — 已删除（Phase 2）
### 6. VideoGenerateParams deprecated 字段 — 待清理
### 7. ✅ AiGenerateConfig 枚举值 — 已补全 v3 值 + 保留 v2 compat（Phase 2）
### 8. ✅ editingUnlockedIds 全局 Set — 已迁移到 useVersionStack.ts hook（Phase 3）
### 9. ✅ localhost URL 处理分支 — 已清理注释引用（Phase 4）
### 10. ✅ 后端 resolvePayloadMediaInputs — 已删除（Phase 4）

## P2 — 重复代码提取 ✅ 全部完成

### 11. ✅ useSourceImage hook — 5 个 variant 已重构（Phase 2）
### 12. ✅ useMediaSlots hook — 3 个 variant 已重构（Phase 2）

### 13. ✅ 版本堆叠状态管理重复 — 已提取 4 个 hooks（Phase 3）
- mapErrorToMessageKey, useVersionStackState, useVersionStackFailureState, useVersionStackEditingOverride

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
