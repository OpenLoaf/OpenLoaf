## 更新内容

### ✨ 全新 AI 工具体系
- 工具重命名为直觉化名称：`Read`、`Edit`、`Write`、`Glob`、`Grep`、`Bash`
- 拆分 fileTools 为独立的 Read/Edit/Write 模块
- 新增 `Glob`（文件模式匹配）和 `Grep`（内容搜索）专用工具
- 核心工具始终可见，不再需要通过 ToolSearch 延迟加载

### 🚀 WebFetch & WebSearch 增强
- WebFetch：LRU 缓存（15分钟 TTL、50MB 上限）、手动重定向处理、URL 验证、http→https 自动升级
- WebSearch：域名过滤（允许/屏蔽域名列表）、结构化文本输出并附带来源提醒
- 两个工具输出格式更加简洁清晰

### 🚀 上下文窗口智能管理
- 微压缩：对空闲间隔后的旧工具结果进行压缩以节省 token
- 上下文折叠管理器，更智能地管理对话历史
- 工具结果拦截器，支持后处理工具输出

### 💄 界面优化
- 聊天：统一 ChatInput 实例，防止页面切换时模型选择状态丢失
- 画布列表：缓存命中时跳过错开动画，实现即时渲染
- 画布连接线：PixiConnectorLayer 渲染改进
- 外部技能：设置页新增导入横幅和对话框

### 🔧 Agent 与 Prompt 调优
- 扩展 Agent 工厂核心工具集
- 更新 master 和 PM agent 模板及身份 prompt
- 优化内置技能描述（文件操作、项目操作、工作台操作等）

### 🐛 问题修复
- 认证回调页面和路由改进
- StreamingCodeViewer 稳定性修复
- 画布视图状态和视频节点改进

### 📦 依赖
- 新增 lru-cache 用于 WebFetch 缓存
