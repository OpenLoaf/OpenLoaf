### ✨ 新功能
- **后台任务系统**：新增 Jobs / Tail / Kill 工具，AI 可以把长时命令丢到后台运行、按需拉取输出、随时终止；聊天输入区新增 BackgroundProcessBar 实时展示运行中的后台任务
- **Sleep 工具**：AI 可以主动延迟后续动作并定时唤醒自己，支持自定节奏的轮询与回合末的输出回收
- **回合末 drain 循环**：每轮结束时自动回收尚未返回的后台输出，不需要用户追问
- **跨模态 ChipBar**：图像 / 文本节点上新增 ChipBar，一键把生成内容转投到另一模态（图像 ↔ 文本 ↔ 视频）
- **工具进度流式渲染**：长耗时工具现在通过 `data-tool-progress` 持续上报进度，UI 显示实时状态而非转圈

### 🚀 改进
- **Master Prompt v5 收敛**：Master 与 PM 共用一套 `harness-v5`，硬规则进一步精简；ToolSearch 引导内联；prompt 组装完全中英双语，可运行时切换
- **内置技能整合**：`browser-automation-guide` 合并为新的 `browser-ops` 技能；`office-document-guide` 替换为统一的 `pdf-word-excel-pptx` 技能；技能加载器与索引同步更新
- **工具目录大改**：`packages/api/src/types/tools/` 下所有工具 Zod schema 重写，类型更严格、描述更清晰、ToolSearch 匹配更精准；清理了多个 `z.any()` 兜底
- **Supervision 服务**：工具调用监督逻辑加固，审批 / drain 边界场景新增大量测试
- **上下文窗口管理**：长对话的 token 计算与裁剪逻辑改进
- **模型注册表**：移除旧的 `packages/api/src/common/modelRegistry.ts`，云端模型映射统一收敛到 `cloudModelMapper`

### 🐛 修复
- **Drain 预算截止时间** 改为从首次 drain 开始计算，避免长工具链被提前超时中断
- **审批挂起时** 不再触发 while-loop 自动 drain；后台工具移入核心工具集，全局可用性一致
- **浏览器自动化**：桌面端 CDP 客户端重构并抽出 `cdpUtils`，标签页附加与动作下发更可靠
- **Shell 沙箱**：命令审批规则收紧，新增测试覆盖审批矩阵
- **Web Fetch**：新增回归测试覆盖重定向与错误处理

### 🔧 重构
- **重命名**：`BgList` / `BgOutput` / `BgKill` → `Jobs` / `Tail` / `Kill`（动词更直白、名字更短）
- **重命名**：`task-ops` 技能与工具族 → `schedule-ops`；废弃的 `runtime-task-ops` 彻底移除
- **后台进程管理器** 从 chat stream 服务中拆出，独立为 `services/background/` 模块，带类型化事件与干净的关闭钩子
- **聊天 UI**：`MessageItem` / `MessageAi` / `MessageHelper` 重构；工具渲染器（`UnifiedTool` / `OpenUrlTool` / `RequestUserInputTool` / `ShellTool`）收紧；新增 `JobsTool` / `SleepTool` / `LoadSkillTool` / `BrowserActionTool` 渲染器
- **桌面 IPC**：CDP 相关 IPC 处理拆分到独立 `cdpUtils` 模块；preload API 表面清理
