### ✨ 新功能
- 运行时任务系统与计划审批工作流
- 计划模式委托给计划子代理，支持调试检查
- 桌面端开发/生产服务支持 HTTPS

### 🚀 改进
- 画布 TextAiPanel V3 架构简化重写
- 画布 TextNode 增强渲染与 ResizeHandle 重构
- AI ChatCoreProvider 重构，改善状态管理
- 画布模板支持 HMR 节点重注册

### ⚡ 性能
- 为 board、chatSession、calendarItem 添加复合数据库索引

### 🔧 重构
- AI 模块全面技术债务清理（47 项）
- 拆分 5 个 God Object：agentManager、chatFileStore、settings、email、ProjectTree
- 提取共享格式化逻辑并拆分 chatStreamService
- 精简 Agent 工具与 Shell 沙箱豁免
- 消除 20 处不必要的 `as any` 并收紧 z.any() 类型

### 🐛 修复
- 修复画布模板 HMR 节点重注册
- 修复 PlanItem 类型以支持步骤状态追踪

### 📦 依赖
- 升级 @openloaf-saas/sdk 至 0.1.38
