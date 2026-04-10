### ✨ 新功能
- 画布空状态引导重新设计为对话式入口 — 用一句话描述目标，自动为你搭好画布，内置图像/视频/音频/分镜等示例提示词
- 新增 AI 偏好项：切换内置 Master / PM 智能体系统 prompt 的语言（中文 / 英文），默认英文
- 画布右键菜单新增「在当前窗口打开」，与「在新窗口打开」并列
- 子智能体面板参与版本栈 overlay，拥有独立标题

### 🚀 改进
- AI Prompt 流水线升级到 v5：master 智能体重写为精简的身份 + 技能路由 prompt，与 PM 智能体共享全新 `harness-v5`；hardRules 从 ~380 行精简到 ~70 行；system-skills 块不再截断 skill 描述，确保 ToolSearch 能匹配完整名称
- 内置 Skill 整合：`multi-agent-routing` 和 `system-agent-architecture` 合并为 `agent-orchestration`；`memory-ops` 指引作为常驻行为内联到 harness；移除 `openloaf-basics` 基线 skill。内置 Skill 数量：16 → 14
- 插入工具标签在全部语言（en / zh-CN / zh-TW / ja）下更清晰：「写文本」「用 AI 生成图像」…
- AI 调试查看器新增 prompt 装配和 tool-search 状态的详细检视
- 文本节点编辑：TextNode 大量重写，改善行内编辑、流式更新和 variant 处理；TextAiPanel 与 V3 流式 Hook 同步重构
- Tool-search rehydrate：跨重试状态重建更健壮，补充回归测试

### 🐛 Bug 修复
- 补齐此前缺失的 `runtime-task-ops` SKILL.md，新克隆仓库可正常构建
- VersionStackOverlay 移到 NodeFrame 层，避免被滚动容器裁剪

### 🔧 重构
- 移除旧版画布右键菜单和 workflow-template 选择器，改走新的空状态引导入口
- `BoardCanvasInteraction` 精简约 480 行；空引导、分组节点选择器、选区 overlay 一并整理
- Chat 流服务、图像编排器、preface builder、request context 全链路打通 `promptLanguage`
