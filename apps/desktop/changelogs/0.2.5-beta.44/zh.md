## 更新内容

### ✨ 统一工具命名 (PascalCase)
- 所有工具 ID 从 kebab-case 重命名为 PascalCase，保持一致性
- `AskUserQuestion` 工具重命名并简化 schema
- Agent 工具重构：`SpawnAgent`/`WaitAgent` 替换为统一的 SubAgent 系统和新的 `SendMessage` 工具

### 🚀 增强工具 UI 渲染器
- 新增 `Glob`、`Grep`、`Read` 工具专用渲染器
- 新增 `SubAgentPanel` 组件，支持内联子智能体对话展示
- 改进 `RequestUserInput` 工具审批交互体验

### 🎨 画布增强
- 音频节点：支持录音功能和波形可视化
- 文本 AI 面板：多功能标签系统和技能插槽栏
- 视频节点：改进播放控制
- 文本节点：优化编辑体验

### 💄 界面优化
- ChatInput 布局简化
- 项目卡片缓存命中时跳过交错动画
- 模型偏好面板精简
- 聊天命令菜单增强

### 🐛 修复
- 修复 web 和 server 中残留的 kebab-case 工具类型
- 修复工具注册表和能力组对齐问题
